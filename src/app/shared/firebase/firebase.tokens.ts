import { InjectionToken } from '@angular/core';
import { FirebaseApp } from 'firebase/app';
import { Auth } from 'firebase/auth';
import { Firestore } from 'firebase/firestore';

/** Die initialisierte Firebase-App-Instanz. */
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');

/** Firebase Authentication (Login, Registrierung, Passwort-Reset). */
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');

/** Cloud Firestore (users, channels, messages, threads, reactions). */
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
