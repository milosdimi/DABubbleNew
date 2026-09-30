import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

const INTRO_DURATION_MS = 2400;
/** Groesse des Logos in der Bildmitte, hoechstens 80 % der Bildschirmbreite. */
const START_SCALE = 2.4;
const MAX_START_WIDTH = 0.8;

/**
 * Splash-Screen: Logo-Animation (Figma "00-Intro"), danach zu /login. Klick überspringt.
 * Das Logo startet exakt in der Bildmitte und landet exakt auf dem Header-Logo der Login-Seite.
 */
@Component({
  selector: 'app-intro',
  templateUrl: './intro.html',
  styleUrl: './intro.scss',
})
export class Intro {
  private readonly router = inject(Router);
  private readonly logo = viewChild.required<ElementRef<HTMLElement>>('logo');

  protected readonly ready = signal(false);
  protected readonly dockStyle = signal('');

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected skip(): void {
    this.goToLogin();
  }

  /** Wartet auf die Schrift, damit die Breite des Schriftzugs beim Messen stimmt. */
  private async start(): Promise<void> {
    await document.fonts?.ready;
    this.dockStyle.set(this.centerOffset(this.logo().nativeElement));
    this.ready.set(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.timer = setTimeout(() => this.goToLogin(), reduced ? 300 : INTRO_DURATION_MS);
  }

  /** Verschiebung von der Header-Position in die Bildmitte (transform-origin: top left). */
  private centerOffset(logo: HTMLElement): string {
    const rect = logo.getBoundingClientRect();
    const scale = Math.min(START_SCALE, (window.innerWidth * MAX_START_WIDTH) / rect.width);
    const x = window.innerWidth / 2 - rect.left - (rect.width * scale) / 2;
    const y = window.innerHeight / 2 - rect.top - (rect.height * scale) / 2;
    return `--dock-x: ${x}px; --dock-y: ${y}px; --dock-scale: ${scale}`;
  }

  private goToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
