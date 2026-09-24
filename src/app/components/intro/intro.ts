import { Component, DestroyRef, inject } from '@angular/core';
import { Router } from '@angular/router';

const INTRO_DURATION_MS = 2400;
const SEEN_KEY = 'dabubble-intro-seen';

/**
 * Splash-Screen: Logo-Animation (Figma "00-Intro"), danach zu /login. Klick überspringt.
 * Spielt nur EINMAL pro Browser (localStorage) – danach direkt weiter zu /login.
 * Wieder ansehen: `?intro` an die URL hängen, oder localStorage leeren.
 */
@Component({
  selector: 'app-intro',
  templateUrl: './intro.html',
  styleUrl: './intro.scss',
})
export class Intro {
  private readonly router = inject(Router);

  constructor() {
    if (this.alreadySeen()) {
      queueMicrotask(() => this.goToLogin());
      return;
    }
    this.markSeen();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => this.goToLogin(), reduced ? 300 : INTRO_DURATION_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  protected skip(): void {
    this.goToLogin();
  }

  private goToLogin(): void {
    void this.router.navigate(['/login']);
  }

  private alreadySeen(): boolean {
    if (window.location.search.includes('intro')) return false;
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markSeen(): void {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Storage blockiert (z. B. Privatmodus) – dann eben jedes Mal, kein Beinbruch.
    }
  }
}
