import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** Figma: auf dem Desktop hoechstens 20 Reaktionen pro Nachricht. */
export const REACTION_LIMIT_DESKTOP = 20;
/** Figma: in Threads und mobil hoechstens 7 (zwei Zeilen), danach "+X weitere". */
export const REACTION_LIMIT_COMPACT = 7;
/** Ab dieser Breite gilt "mobil". Beim Responsive-Umbau mit Figma abgleichen. */
const MOBILE_QUERY = '(max-width: 900px)';

/**
 * Ueberlauf der Reaktionen (Figma-Hinweis): Zu viele Reaktionen werden hinter
 * einer Pille "+X weitere" versteckt; ein Klick zeigt alle und "Weniger anzeigen".
 * Merkt sich, welche Nachrichten aufgeklappt sind (Main-Chat und Thread).
 */
@Injectable({ providedIn: 'root' })
export class ReactionOverflowService {
  /** Schmale Ansicht (mobil)? Dann gilt auch im Main-Chat das Limit von 7. */
  readonly compact = signal(false);

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  constructor() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => this.compact.set(query.matches);
    update();
    query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
  }

  /** Limit im Main-Chat: 20 auf dem Desktop, 7 mobil. */
  mainChatLimit(): number {
    return this.compact() ? REACTION_LIMIT_COMPACT : REACTION_LIMIT_DESKTOP;
  }

  isExpanded(messageId: string): boolean {
    return this.expanded().has(messageId);
  }

  toggle(messageId: string): void {
    this.expanded.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(messageId)) next.add(messageId);
      return next;
    });
  }

  /** Die anzuzeigenden Reaktionen: zugeklappt nur die ersten `limit`. */
  visible<T>(items: readonly T[], messageId: string, limit: number): readonly T[] {
    return this.isExpanded(messageId) ? items : items.slice(0, limit);
  }

  /** Wie viele Reaktionen ueber das Limit hinausgehen (0 = kein Ueberlauf). */
  overflow(items: readonly unknown[], limit: number): number {
    return Math.max(0, items.length - limit);
  }
}
