import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
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

  // Nur im Build-Modus "emulator" gesetzt (environment.emulator.ts).
  const emulatorHost = environment.emulatorHost;
  if (emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, emulatorHost, 8080);
  }

  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: app },
    { provide: FIREBASE_AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: firestore },
  ]);
}
