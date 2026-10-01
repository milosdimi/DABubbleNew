import { afterNextRender, Injector } from '@angular/core';
import { prefersReducedMotion } from './mobile-query';

const DURATION_MS = 250;

/**
 * Vor einer Aenderung aufrufen, die die Hoehe von `element` aendert (z. B. Anzeige ->
 * Eingabefeld): Nach dem naechsten Rendern gleitet das Element von der alten auf die neue
 * Hoehe. Alles darunter rutscht so weich mit statt zu springen (keine harte DOM-Verschiebung).
 */
export function animateHeight(element: HTMLElement | undefined, injector: Injector): void {
  if (!element || prefersReducedMotion()) return;
  const from = element.getBoundingClientRect().height;
  afterNextRender(
    () => {
      const to = element.getBoundingClientRect().height;
      if (Math.abs(to - from) < 1) return;
      element.animate(
        [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }],
        { duration: DURATION_MS, easing: 'ease-in-out' },
      );
    },
    { injector },
  );
}
