/**
 * Lokale Tests gegen die Firebase-Emulatoren (Auth + Firestore).
 * Aktiv mit: npm run start:emulator  (ng serve --configuration emulator)
 * Die Projekt-ID beginnt mit "demo-": Damit kann das SDK keine echten
 * Firebase-Dienste erreichen. Enthaelt keine Geheimnisse, darf versioniert werden.
 */
export const environment = {
  production: false,
  emulatorHost: '127.0.0.1' as string | null,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-dabubble.firebaseapp.com',
    projectId: 'demo-dabubble',
    storageBucket: '',
    messagingSenderId: '',
    appId: 'demo-app',
  },
  storage: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    bucket: 'chat-attachments',
  },
};
