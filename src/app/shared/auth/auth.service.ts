import { inject, Injectable } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import {
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { User } from '../models';
import { UserService } from '../user/user.service';

/** Deutsche, feldnahe Fehlermeldungen je Firebase-Auth-Fehlercode (DoD: keine Alerts). */
const AUTH_ERROR_MESSAGES: Record<string, string | undefined> = {
  'auth/invalid-email': 'Diese E-Mail-Adresse ist leider ungültig.',
  'auth/invalid-credential': 'E-Mail oder Passwort ist falsch.',
  'auth/user-not-found': 'E-Mail oder Passwort ist falsch.',
  'auth/wrong-password': 'E-Mail oder Passwort ist falsch.',
  'auth/user-disabled': 'Dieses Konto wurde deaktiviert.',
  'auth/too-many-requests': 'Zu viele Versuche. Bitte versuche es später erneut.',
  'auth/network-request-failed': 'Netzwerkfehler. Bitte prüfe deine Internetverbindung.',
  'auth/popup-closed-by-user': 'Anmeldung abgebrochen.',
  'auth/popup-blocked': 'Das Anmelde-Popup wurde blockiert. Bitte erlaube Popups.',
  'auth/email-already-in-use': 'Diese E-Mail-Adresse wird bereits verwendet.',
  'auth/weak-password': 'Das Passwort ist zu schwach. Bitte wähle mindestens 6 Zeichen.',
  'auth/operation-not-allowed': 'Diese Anmeldemethode ist nicht aktiviert.',
  'auth/expired-action-code': 'Dieser Link ist abgelaufen. Bitte fordere einen neuen Link an.',
  'auth/invalid-action-code': 'Dieser Link ist ungültig oder wurde bereits verwendet.',
  'permission-denied': 'Speichern nicht erlaubt. Bitte prüfe die Firestore-Regeln.',
  unavailable: 'Dienst nicht erreichbar. Bitte versuche es später erneut.',
};

const FALLBACK_MESSAGE = 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);

  async loginWithEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async loginWithGoogle(): Promise<void> {
    const { user } = await signInWithPopup(this.auth, new GoogleAuthProvider());
    await this.userService.ensureProfile(this.toProfile(user));
  }

  /** Gaeste bekommen bewusst KEIN users-Dokument (anonymer Login genuegt). */
  async loginAsGuest(): Promise<void> {
    await signInAnonymously(this.auth);
  }

  /** Baut ein Default-Profil aus den Google-Daten des Firebase-Auth-Users. */
  private toProfile(user: FirebaseUser): User {
    return {
      id: user.uid,
      name: user.displayName ?? 'Nutzer',
      email: user.email ?? '',
      avatarUrl: user.photoURL ?? 'img/avatar/avatar01.svg',
      onlineStatus: 'online',
    };
  }

  /** Legt den Auth-Account an, setzt den Anzeigenamen und liefert die neue User-ID. */
  async registerWithEmail(name: string, email: string, password: string): Promise<string> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    return credential.user.uid;
  }

  /**
   * Schickt eine Passwort-Reset-Mail. `auth/user-not-found` wird bewusst
   * geschluckt (Schutz gegen E-Mail-Enumeration) – der Aufrufer zeigt immer
   * dieselbe neutrale Erfolgsmeldung. Wohin der Link zeigt, wird über die
   * Action-URL in der Firebase Console gesteuert (Auth -> Templates), nicht hier.
   */
  async sendResetEmail(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'auth/user-not-found') return;
      throw error;
    }
  }

  /** Setzt das Passwort per oobCode aus der Reset-Mail. Wirft `Error` mit fertiger Meldung. */
  async confirmReset(oobCode: string, newPassword: string): Promise<void> {
    try {
      await confirmPasswordReset(this.auth, oobCode, newPassword);
    } catch (error) {
      throw new Error(this.toMessage(error));
    }
  }

  toMessage(error: unknown): string {
    const code = error instanceof FirebaseError ? error.code : '';
    return AUTH_ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE;
  }
}
