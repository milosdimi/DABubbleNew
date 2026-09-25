import { inject, Injectable } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  DocumentSnapshot,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Query,
  QuerySnapshot,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.tokens';
import { Channel } from '../models';

/** Feste Channels, immer in dieser Reihenfolge ganz oben (wie in Figma). */
const PINNED_CHANNEL_NAMES = ['Entwicklerteam', 'Office-Team'];

/** Dieser feste Channel ist fuer alle registrierten User sichtbar. */
const OPEN_CHANNEL_NAME = 'Office-Team';

/**
 * `memberIds` soll eine Liste von uids sein. Aeltere Datensaetze haben teils
 * eine andere Form; hier wird sie in eine Liste umgewandelt, statt die App
 * spaeter bei `.includes()` abstuerzen zu lassen.
 */
const warnedChannelIds = new Set<string>();

function normalizeMemberIds(channelId: string, raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string');

  if (!warnedChannelIds.has(channelId)) {
    warnedChannelIds.add(channelId);
    console.warn(`[channels] Channel "${channelId}": memberIds ist keine Liste, sondern`, raw);
  }
  if (typeof raw === 'string') return [raw];
  if (raw && typeof raw === 'object') {
    const entries = Object.entries(raw as Record<string, unknown>);
    // {"0": "uidA", "1": "uidB"} -> Werte; {"uidA": true} -> Schluessel
    const indexed = entries.every(([key]) => /^\d+$/.test(key));
    return indexed
      ? entries.map(([, value]) => value).filter((id): id is string => typeof id === 'string')
      : entries.filter(([, value]) => value).map(([key]) => key);
  }
  return [];
}

/** Firestore-Dokument -> Channel, mit bereinigtem `memberIds` und `id` als Fallback. */
function toChannel(snapshot: DocumentSnapshot): Channel {
  const data = snapshot.data() as Channel;
  return {
    ...data,
    id: data.id ?? snapshot.id,
    memberIds: normalizeMemberIds(snapshot.id, data.memberIds),
  };
}

/** Wer gerade zuschaut - Grundlage der Sichtbarkeitsregeln. */
export interface Viewer {
  uid: string | null;
  isGuest: boolean;
}

/** Zugriff auf die Firestore-Collection `channels`. */
@Injectable({ providedIn: 'root' })
export class ChannelService {
  private readonly firestore = inject(FIRESTORE);

  /** Legt einen neuen Channel an (Auto-ID) und liefert dessen ID. */
  async createChannel(name: string, description: string, createdBy: string): Promise<string> {
    const channels = collection(this.firestore, 'channels');
    const ref = doc(channels);
    const channel: Channel = {
      id: ref.id,
      name,
      description,
      memberIds: [createdBy],
      createdBy,
      createdAt: Date.now(),
      guestVisible: false,
    };
    await setDoc(ref, channel);
    return channel.id;
  }

  /** Liefert alle Channels (z. B. fuer die Sidebar-Liste). */
  async listChannels(): Promise<Channel[]> {
    const snapshot = await getDocs(collection(this.firestore, 'channels'));
    return snapshot.docs.map(toChannel);
  }

  /**
   * Sichtbarkeitsregeln (identisch in firestore.rules abgebildet):
   * - `guestVisible` -> fuer alle (auch Gaeste)
   * - Gaeste sehen sonst nichts
   * - "Office-Team" -> fuer alle registrierten User
   * - alle anderen Channels -> nur fuer Mitglieder
   *
   * Jede Regel ist eine eigene Firestore-Abfrage. So liest der Client nie
   * Dokumente, die die Rules ihm verweigern wuerden.
   */
  private visibilityQueries(viewer: Viewer): Query[] {
    const channels = collection(this.firestore, 'channels');
    const queries = [query(channels, where('guestVisible', '==', true))];
    if (viewer.isGuest || !viewer.uid) return queries;

    queries.push(
      query(channels, where('memberIds', 'array-contains', viewer.uid)),
      query(channels, where('name', '==', OPEN_CHANNEL_NAME)),
    );
    return queries;
  }

  /** Einmalig: die fuer `viewer` sichtbaren Channels, feste Channels zuerst. */
  async listVisibleChannels(viewer: Viewer): Promise<Channel[]> {
    const snapshots = await Promise.all(this.visibilityQueries(viewer).map((q) => getDocs(q)));
    return this.mergeSorted(snapshots.map((snapshot) => this.toChannels(snapshot)));
  }

  /** Live: die fuer `viewer` sichtbaren Channels, feste Channels zuerst. */
  watchVisibleChannels(viewer: Viewer, callback: (channels: Channel[]) => void): Unsubscribe {
    const queries = this.visibilityQueries(viewer);
    const results: Channel[][] = queries.map(() => []);
    const received = new Set<number>();

    const unsubscribes = queries.map((q, index) =>
      onSnapshot(q, (snapshot) => {
        results[index] = this.toChannels(snapshot);
        received.add(index);
        // Erst melden, wenn jede Abfrage einmal geantwortet hat - sonst flackert die Liste.
        if (received.size === queries.length) callback(this.mergeSorted(results));
      }, (error) => console.warn('[channels] Listener beendet:', error.code)),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  private toChannels(snapshot: QuerySnapshot): Channel[] {
    return snapshot.docs.map(toChannel);
  }

  /** Fuehrt die Teilergebnisse ohne Duplikate zusammen, feste Channels zuerst. */
  private mergeSorted(parts: Channel[][]): Channel[] {
    const byId = new Map<string, Channel>();
    for (const channel of parts.flat()) byId.set(channel.id, channel);
    return [...byId.values()].sort((a, b) => this.pinRank(a) - this.pinRank(b));
  }

  /** Feste Channels bekommen ihren Listenplatz, alle anderen landen dahinter. */
  private pinRank(channel: Channel): number {
    const index = PINNED_CHANNEL_NAMES.indexOf(channel.name);
    return index === -1 ? PINNED_CHANNEL_NAMES.length : index;
  }

  /** Ueberschreibt die Mitgliederliste eines bestehenden Channels. */
  async setMembers(channelId: string, memberIds: string[]): Promise<void> {
    const ref = doc(this.firestore, 'channels', channelId);
    await updateDoc(ref, { memberIds });
  }

  /** Fuegt Mitglieder hinzu, ohne bestehende zu ueberschreiben. */
  async addMembers(channelId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const ref = doc(this.firestore, 'channels', channelId);
    await updateDoc(ref, { memberIds: arrayUnion(...userIds) });
  }

  /**
   * Live-Beobachtung eines einzelnen Channels. `onLost` feuert, wenn er
   * geloescht wird oder nicht mehr lesbar ist (z. B. nach "Channel verlassen").
   */
  watchChannel(
    channelId: string,
    onChange: (channel: Channel) => void,
    onLost: () => void,
  ): Unsubscribe {
    return onSnapshot(
      doc(this.firestore, 'channels', channelId),
      (snapshot) => (snapshot.exists() ? onChange(toChannel(snapshot)) : onLost()),
      () => onLost(),
    );
  }

  /** Liefert ein einzelnes Channel-Dokument, oder null falls es nicht existiert. */
  async getChannel(channelId: string): Promise<Channel | null> {
    const snapshot = await getDoc(doc(this.firestore, 'channels', channelId));
    return snapshot.exists() ? toChannel(snapshot) : null;
  }

  /** Aktualisiert Name/Beschreibung (Channel-Verwaltungs-Dialog, nur Ersteller). */
  async updateChannel(
    channelId: string,
    changes: Partial<Pick<Channel, 'name' | 'description'>>,
  ): Promise<void> {
    await updateDoc(doc(this.firestore, 'channels', channelId), changes);
  }

  /** Entfernt ein Mitglied (Rules: nur der Ersteller darf andere entfernen). */
  async removeMember(channelId: string, uid: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'channels', channelId), { memberIds: arrayRemove(uid) });
  }

  /** Entfernt die eigene uid aus memberIds ("Channel verlassen"). */
  async leaveChannel(channelId: string, uid: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'channels', channelId), { memberIds: arrayRemove(uid) });
  }
}
