import { DestroyRef, inject, Injectable } from '@angular/core';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { OnlineStatus } from '../models';
import { UserService } from '../user/user.service';

/**
 * Haelt den angezeigten Status (`onlineStatus`) des eigenen Profils aktuell:
 * - Workspace betreten -> der selbst gewaehlte Status (`chosenStatus`, sonst "online")
 * - Log out / Tab schliessen -> "offline"
 * Gaeste haben kein users-Dokument und gelten immer als "online".
 *
 * Das Offline-Setzen beim Schliessen des Tabs ist nur ein Versuch: der Browser
 * wartet nicht auf die Anfrage. Verlaessliche Praesenz ginge nur mit der
 * Firebase Realtime Database (onDisconnect).
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);

  /** Vom Workspace aufgerufen; `destroyRef` beendet den Tab-Schliessen-Listener. */
  async start(destroyRef: DestroyRef): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user || user.isAnonymous) return;

    const profile = await this.userService.getUser(user.uid);
    const shown = profile?.chosenStatus ?? 'online';
    if (profile && profile.onlineStatus !== shown) {
      await this.userService.updateStatus(user.uid, { onlineStatus: shown });
    }

    const onLeave = () => void this.goOffline();
    window.addEventListener('pagehide', onLeave);
    destroyRef.onDestroy(() => window.removeEventListener('pagehide', onLeave));
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
      await this.userService.updateStatus(user.uid, { onlineStatus: 'offline' });
    } catch (error) {
      console.warn('[presence] Status konnte nicht auf offline gesetzt werden:', error);
    }
  }
}
