import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase.tokens';
import { Channel, DirectChat, Message } from '../models';

/** Kennung eines Chats wie ChatTarget: "channel:<id>" bzw. "dm:<id>". */
type ChatKey = string;

/** Eintrag in readState, der den Start der Ungelesen-Zaehlung markiert. */
const SINCE_KEY = '_since';

/**
 * Rote Punkte in der Sidebar (eigene Idee, nicht in Figma): Ein Chat ist
 * ungelesen, wenn seine neueste Nachricht von jemand anderem stammt und nach
 * dem eigenen Gelesen-Stand (users/{uid}/readState/{chatKey}) geschrieben wurde.
 *
 * Pro Chat wird nur die neueste Nachricht beobachtet (limit 1). Beim allerersten
 * Start gilt alles Bisherige als gelesen (Eintrag "_since"). Thread-Antworten
 * zaehlen nicht mit.
 */
@Injectable({ providedIn: 'root' })
export class UnreadService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly firestore = inject(FIRESTORE);

  private uid: string | null = null;
  private readonly readState = signal<ReadonlyMap<ChatKey, number>>(new Map());
  private readonly since = signal<number | null>(null);
  private readonly latest = signal<ReadonlyMap<ChatKey, Pick<Message, 'senderId' | 'timestamp'>>>(new Map());
  private readonly dmIdByPartner = signal<ReadonlyMap<string, string>>(new Map());
  private readonly latestListeners = new Map<ChatKey, Unsubscribe>();
  private channelKeys = new Set<ChatKey>();
  private dmKeys = new Set<ChatKey>();

  /** Ist der Browser-Tab sichtbar? Nur dann gilt ein offener Chat als gelesen. */
  readonly pageVisible = signal(typeof document === 'undefined' || !document.hidden);

  /** Von der Sidebar aufgerufen; laeuft, bis die Sidebar verschwindet. */
  async start(destroyRef: DestroyRef): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) return;
    this.uid = user.uid;

    const stopReadState = onSnapshot(collection(this.firestore, 'users', user.uid, 'readState'), (snapshot) => {
      const map = new Map<ChatKey, number>();
      for (const entry of snapshot.docs) map.set(entry.id, entry.data()['lastReadAt'] as number);
      const since = map.get(SINCE_KEY);
      if (since === undefined) void this.writeReadState(SINCE_KEY, Date.now());
      this.since.set(since ?? null);
      map.delete(SINCE_KEY);
      this.readState.set(map);
    });

    const chats = query(collection(this.firestore, 'directChats'), where('memberIds', 'array-contains', user.uid));
    const stopDirectChats = onSnapshot(chats, (snapshot) => {
      const partners = new Map<string, string>();
      for (const entry of snapshot.docs) {
        const chat = entry.data() as DirectChat;
        partners.set(chat.memberIds.find((id) => id !== user.uid) ?? user.uid, chat.id);
      }
      this.dmIdByPartner.set(partners);
      this.dmKeys = this.syncListeners(this.dmKeys, [...partners.values()].map((id) => `dm:${id}`));
    });

    const onVisibility = () => this.pageVisible.set(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    destroyRef.onDestroy(() => {
      stopReadState();
      stopDirectChats();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const stop of this.latestListeners.values()) stop();
      this.latestListeners.clear();
      this.channelKeys.clear();
      this.dmKeys.clear();
    });
  }

  /** Sidebar meldet die sichtbaren Channels; fuer jeden wird die neueste Nachricht beobachtet. */
  watchChannels(channels: readonly Channel[]): void {
    this.channelKeys = this.syncListeners(this.channelKeys, channels.map((c) => `channel:${c.id}`));
  }

  isChannelUnread(channelId: string): boolean {
    return this.isUnread(`channel:${channelId}`);
  }

  /** Direktchat mit `partnerId` ungelesen? (Ohne bestehenden Chat: nein.) */
  isUserUnread(partnerId: string): boolean {
    const dmId = this.dmIdByPartner().get(partnerId);
    return !!dmId && this.isUnread(`dm:${dmId}`);
  }

  /** Offener Chat gelesen bis `timestamp`; schreibt nur, wenn das neuer ist als der Stand. */
  markRead(key: ChatKey, timestamp: number): void {
    if ((this.readState().get(key) ?? 0) >= timestamp) return;
    this.readState.update((map) => new Map(map).set(key, timestamp));
    void this.writeReadState(key, timestamp);
  }

  private isUnread(key: ChatKey): boolean {
    const latest = this.latest().get(key);
    const since = this.since();
    if (!latest || since === null || latest.senderId === this.uid) return false;
    return latest.timestamp > (this.readState().get(key) ?? since);
  }

  /** Startet Listener fuer neue Keys, beendet sie fuer weggefallene. */
  private syncListeners(previous: Set<ChatKey>, keys: ChatKey[]): Set<ChatKey> {
    const next = new Set(keys);
    for (const key of previous) {
      if (next.has(key)) continue;
      this.latestListeners.get(key)?.();
      this.latestListeners.delete(key);
    }
    for (const key of next) {
      if (!this.latestListeners.has(key)) this.latestListeners.set(key, this.watchLatest(key));
    }
    return next;
  }

  private watchLatest(key: ChatKey): Unsubscribe {
    const [kind, id] = key.split(':');
    const messages = collection(this.firestore, kind === 'channel' ? 'channels' : 'directChats', id, 'messages');
    return onSnapshot(
      query(messages, orderBy('timestamp', 'desc'), limit(1)),
      (snapshot) => {
        const newest = snapshot.docs[0]?.data() as Message | undefined;
        this.latest.update((map) => {
          const next = new Map(map);
          if (newest) next.set(key, { senderId: newest.senderId, timestamp: newest.timestamp });
          else next.delete(key);
          return next;
        });
      },
      // z. B. nach "Channel verlassen": kein Lesezugriff mehr -> kein Punkt.
      () => this.latest.update((map) => {
        const next = new Map(map);
        next.delete(key);
        return next;
      }),
    );
  }

  private async writeReadState(key: ChatKey, lastReadAt: number): Promise<void> {
    if (!this.uid) return;
    try {
      await setDoc(doc(this.firestore, 'users', this.uid, 'readState', key), { lastReadAt });
    } catch (error) {
      console.warn('[unread] Gelesen-Stand konnte nicht gespeichert werden:', error);
    }
  }
}
