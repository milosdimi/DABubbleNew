/**
 * Vorlage fuer src/environments/environment.ts (nicht versioniert).
 * Kopieren, umbenennen und mit den eigenen Projektwerten fuellen.
 */
export const environment = {
  production: false,

  /** Nur fuer lokale Tests: Host der Firebase-Emulatoren (siehe environment.emulator.ts). */
  emulatorHost: null as string | null,

  /** Firebase-Web-Konfiguration (Firebase Console -> Projekteinstellungen -> Web-App). */
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    /** Realtime Database (nur fuer den Online-Status / Verbindungserkennung). */
    databaseURL: '',
  },

  /** Datei-Storage fuer Nachrichtenanhaenge (vorlaeufig Supabase, Wechsel geplant). */
  storage: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    bucket: 'chat-attachments',
  },
};
