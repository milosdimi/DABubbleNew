import { inject, Injectable } from '@angular/core';
import type { Unsubscribe } from 'firebase/database';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { RealtimeDbService } from '../firebase/realtime-db.service';
import { UserService } from '../user/user.service';

/** Nach so vielen ms ohne Tippen verschwindet "... schreibt gerade". */
const STOP_AFTER_MS = 4000;
/** Hoechstens so oft wird der Eintrag erneuert (weniger Schreibzugriffe). */
const PING_EVERY_MS = 2500;

/**
 * "Anna schreibt gerade ..." (eigene Erweiterung): Eintrag unter
 * /typing/{chatKey}/{uid} in der Realtime Database. Er verschwindet nach
 * kurzer Pause, beim Senden und serverseitig beim Verbindungsabbruch
 * (onDisconnect). chatKey: "channel:<id>", "dm:<id>" oder "thread:<messageId>".
 */
@Injectable({ providedIn: 'root' })
export class TypingService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly realtimeDb = inject(RealtimeDbService);
  private readonly userService = inject(UserService);

  private ownName: Promise<string> | null = null;
  private readonly lastPing = new Map<string, number>();
  private readonly stopTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Beim Tippen aufrufen; erneuert den Eintrag hoechstens alle paar Sekunden. */
  ping(chatKey: string): void {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    clearTimeout(this.stopTimers.get(chatKey));
    this.stopTimers.set(chatKey, setTimeout(() => this.stop(chatKey), STOP_AFTER_MS));

    const now = Date.now();
    if (now - (this.lastPing.get(chatKey) ?? 0) < PING_EVERY_MS) return;
    this.lastPing.set(chatKey, now);
    void this.write(chatKey, uid);
  }

  /** Beim Senden, Chatwechsel oder nach der Pause. */
  stop(chatKey: string): void {
    const uid = this.auth.currentUser?.uid;
    clearTimeout(this.stopTimers.get(chatKey));
    this.stopTimers.delete(chatKey);
    if (!uid || !this.lastPing.has(chatKey)) return;
    this.lastPing.delete(chatKey);
    void this.realtimeDb.load().then(({ db, sdk }) => sdk.remove(sdk.ref(db, `typing/${chatKey}/${uid}`)));
  }

  /** Namen aller anderen, die in `chatKey` gerade tippen. */
  watch(chatKey: string, callback: (names: string[]) => void): Unsubscribe {
    let stop: Unsubscribe | null = null;
    let cancelled = false;
    void this.realtimeDb.load().then(({ db, sdk }) => {
      if (cancelled) return;
      stop = sdk.onValue(
        sdk.ref(db, `typing/${chatKey}`),
        (snapshot) => {
          const names: string[] = [];
          const own = this.auth.currentUser?.uid;
          snapshot.forEach((entry) => {
            if (entry.key !== own) names.push(String(entry.child('name').val() ?? ''));
          });
          callback(names.filter(Boolean));
        },
        () => callback([]),
      );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }

  private async write(chatKey: string, uid: string): Promise<void> {
    try {
      const [{ db, sdk }, name] = await Promise.all([this.realtimeDb.load(), this.resolveOwnName()]);
      const ref = sdk.ref(db, `typing/${chatKey}/${uid}`);
      await sdk.onDisconnect(ref).remove();
      await sdk.set(ref, { name, at: sdk.serverTimestamp() });
    } catch (error) {
      console.warn('[typing] Eintrag konnte nicht geschrieben werden:', error);
    }
  }

  private resolveOwnName(): Promise<string> {
    this.ownName ??= (async () => {
      const user = this.auth.currentUser;
      if (!user || user.isAnonymous) return 'Gast';
      const profile = await this.userService.getUser(user.uid);
      return (profile?.name ?? user.displayName ?? 'Jemand').slice(0, 60);
    })();
    return this.ownName;
  }
}
