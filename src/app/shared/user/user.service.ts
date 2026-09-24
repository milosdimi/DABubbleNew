import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.tokens';
import { User } from '../models';

/** Profile in der Firestore-Collection `users`. */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly firestore = inject(FIRESTORE);

  private userRef(uid: string) {
    return doc(this.firestore, 'users', uid);
  }

  /** Legt das Profil an, falls es noch nicht existiert (bestehende Daten bleiben unangetastet). */
  async ensureProfile(user: User): Promise<void> {
    const ref = this.userRef(user.id);
    const existing = await getDoc(ref);
    if (!existing.exists()) await setDoc(ref, user);
  }

  async getUser(uid: string): Promise<User | null> {
    const snapshot = await getDoc(this.userRef(uid));
    return snapshot.exists() ? (snapshot.data() as User) : null;
  }

  async listUsers(): Promise<User[]> {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    return snapshot.docs.map((entry) => entry.data() as User);
  }

  /** Live-Profil eines Users (`null`, solange keins existiert). */
  watchUser(uid: string, callback: (user: User | null) => void): Unsubscribe {
    return onSnapshot(
      this.userRef(uid),
      (snapshot) => callback(snapshot.exists() ? (snapshot.data() as User) : null),
      (error) => console.warn('[user] Listener beendet:', error.code),
    );
  }

  /** Aendert Name und/oder Avatar eines bestehenden Profils. */
  async updateProfile(
    uid: string,
    changes: Partial<Pick<User, 'name' | 'avatarUrl'>>,
  ): Promise<void> {
    await updateDoc(this.userRef(uid), changes);
  }

  /**
   * Live-Liste der fuer den aktuellen Login sichtbaren User:
   * Gaeste sehen nur Demo-User, registrierte User sehen alle.
   * Fuer Gaeste per Abfrage gefiltert, passend zu firestore.rules.
   */
  watchVisibleUsers(isGuest: boolean, callback: (users: User[]) => void): Unsubscribe {
    const users = collection(this.firestore, 'users');
    const source = isGuest ? query(users, where('isDemo', '==', true)) : users;
    return onSnapshot(
      source,
      (snapshot) => callback(snapshot.docs.map((entry) => entry.data() as User)),
      (error) => console.warn('[users] Listener beendet:', error.code),
    );
  }
}
