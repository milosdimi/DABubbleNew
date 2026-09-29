import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP, FIREBASE_AUTH, FIRESTORE } from './firebase.tokens';

/**
 * Initialisiert Firebase einmalig und stellt App, Auth und Firestore per DI
 * bereit. In app.config.ts einbinden: `provideFirebase()`.
 * Services injizieren die Instanzen ueber FIREBASE_AUTH / FIRESTORE.
 */
export function provideFirebase(): EnvironmentProviders {
  const app = initializeApp(environment.firebase);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  connectEmulators(auth, firestore);

  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: firestore },
  ]);
}

/** Nur im Build-Modus "emulator" gesetzt (environment.emulator.ts). */
function connectEmulators(auth: Auth, firestore: Firestore): void {
  const emulatorHost = environment.emulatorHost;
  if (!emulatorHost) return;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestore, emulatorHost, 8080);
}
