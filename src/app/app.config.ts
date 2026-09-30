import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';
import { provideFirebase } from './shared/firebase/firebase.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Jede Seite (z. B. Impressum <-> Datenschutz) beginnt oben, auch nach "Zurueck".
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideFirebase(),
  ],
};
