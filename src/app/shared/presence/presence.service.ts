import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { RealtimeDbService } from '../firebase/realtime-db.service';
import { OnlineStatus, User } from '../models';
import { UserService } from '../user/user.service';

/**
 * Online-Status aus zwei Quellen (ohne Cloud Functions, Spark-Tarif):
 * - Firestore `onlineStatus` / `chosenStatus`: der selbst gewaehlte Status
 *   (Aktiv, Abwesend, Nicht stoeren, Offline); beim Log out "offline".
 * - Realtime Database `/status/{uid}`: ist der User gerade verbunden? Beim
 *   Verbindungsabbruch (Tab zu, Absturz, WLAN weg) setzt Firebase den Eintrag
 *   serverseitig auf "offline" (onDisconnect).
 * Angezeigt wird `effectiveStatus`: verbunden -> gewaehlter Status, sonst "offline".
 * Demo-User haben keinen echten Client und behalten ihren Firestore-Status.
 * Gaeste haben kein Profil, schreiben nichts und lesen /status nicht.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly realtimeDb = inject(RealtimeDbService);
  private readonly userService = inject(UserService);

  /** uid -> verbunden? `null`, solange unbekannt (z. B. fuer Gaeste). */
  private readonly connections = signal<ReadonlyMap<string, boolean> | null>(null);

  /** Vom Workspace aufgerufen; `destroyRef` beendet die Listener. */
  async start(destroyRef: DestroyRef): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) return;

    // Beim Betreten wieder den selbst gewaehlten Status anzeigen.
    const profile = await this.userService.getUser(user.uid);
    const shown = profile?.chosenStatus ?? 'online';
    if (profile && profile.onlineStatus !== shown) {
      await this.userService.updateStatus(user.uid, { onlineStatus: shown });
    }

    const { db, sdk } = await this.realtimeDb.load();
    const { onDisconnect, onValue, ref, serverTimestamp, set } = sdk;

    // Eigene Verbindung melden; bei jedem (Wieder-)Verbinden neu anmelden.
    const ownStatus = ref(db, `status/${user.uid}`);
    const stopConnected = onValue(ref(db, '.info/connected'), (snapshot) => {
      if (snapshot.val() !== true) return;
      void onDisconnect(ownStatus)
        .set({ state: 'offline', lastChanged: serverTimestamp() })
        .then(() => set(ownStatus, { state: 'online', lastChanged: serverTimestamp() }));
    });

    // Verbindungen aller User (fuer die Punkte in Sidebar, Kopf, Listen, Profil).
    const stopStatus = onValue(
      ref(db, 'status'),
      (snapshot) => {
        const map = new Map<string, boolean>();
        snapshot.forEach((entry) => {
          map.set(entry.key ?? '', entry.child('state').val() === 'online');
        });
        this.connections.set(map);
      },
      (error) => console.warn('[presence] Status-Listener beendet:', error.message),
    );

    destroyRef.onDestroy(() => {
      stopConnected();
      stopStatus();
      this.connections.set(null);
    });
  }

  /** Angezeigter Status: gewaehlter Status, aber "offline", wenn nicht verbunden. */
  effectiveStatus(user: Pick<User, 'id' | 'onlineStatus'> & Partial<Pick<User, 'isDemo'>>): OnlineStatus {
    const connections = this.connections();
    if (!connections || user.isDemo) return user.onlineStatus;
    return connections.get(user.id) ? user.onlineStatus : 'offline';
  }

  /** Status im Profil-Dropdown gewaehlt: sofort anzeigen und fuer den naechsten Login merken. */
  async choose(status: OnlineStatus): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) return;
    await this.userService.updateStatus(user.uid, { onlineStatus: status, chosenStatus: status });
  }

  /** Vor dem Log out: fuer alle anderen "offline" (die eigene Wahl bleibt gespeichert). */
  async goOffline(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) return;
    try {
      const { db, sdk } = await this.realtimeDb.load();
      await Promise.all([
        this.userService.updateStatus(user.uid, { onlineStatus: 'offline' }),
        sdk.set(sdk.ref(db, `status/${user.uid}`), { state: 'offline', lastChanged: sdk.serverTimestamp() }),
      ]);
    } catch (error) {
      console.warn('[presence] Status konnte nicht auf offline gesetzt werden:', error);
    }
  }
}
