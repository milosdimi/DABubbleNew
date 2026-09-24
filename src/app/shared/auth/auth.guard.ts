import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';

/**
 * Wartet auf die erste Auth-State-Emission. Firebase muss beim App-Start
 * erst eine evtl. gespeicherte Session aus IndexedDB laden – ohne das
 * Warten wuerde ein Reload kurzzeitig faelschlich "nicht eingeloggt" sehen.
 */
function firstAuthUser(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/**
 * Schuetzt /workspace (+ Kind-Routen, da canActivate auf einer Route auch
 * fuer ihre children greift). Gast-Logins (anonym) zaehlen als eingeloggt –
 * signInAnonymously liefert einen ganz normalen User mit uid.
 * Nicht eingeloggt -> Redirect zu /login mit ?returnUrl=<angeforderte URL>.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(FIREBASE_AUTH);
  const router = inject(Router);

  const user = await firstAuthUser(auth);
  if (user) return true;

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
