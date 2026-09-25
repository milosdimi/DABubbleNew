import { inject, Injectable } from '@angular/core';
import type { Database } from 'firebase/database';
import { environment } from '../../../environments/environment';
import { FIREBASE_APP } from './firebase.tokens';

export interface RealtimeDb {
  db: Database;
  sdk: typeof import('firebase/database');
}

/**
 * Realtime Database (Online-Status, "tippt gerade"). Das SDK wird erst beim
 * ersten Aufruf geladen (eigener Chunk), damit Login- und Rechtsseiten es
 * nicht mitladen. Im Emulator-Build verbindet es mit dem Database-Emulator.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeDbService {
  private readonly app = inject(FIREBASE_APP);
  private loading: Promise<RealtimeDb> | null = null;

  load(): Promise<RealtimeDb> {
    this.loading ??= import('firebase/database').then((sdk) => {
      const db = sdk.getDatabase(this.app);
      if (environment.emulatorHost) sdk.connectDatabaseEmulator(db, environment.emulatorHost, 9000);
      return { db, sdk };
    });
    return this.loading;
  }
}
