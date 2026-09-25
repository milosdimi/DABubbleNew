import { Injectable, signal } from '@angular/core';

/** Figma: 7 Reaktionen sichtbar (zwei Zeilen), danach "+X weitere". Aufgeklappt ohne Obergrenze. */
export const REACTION_LIMIT = 7;

/**
 * Ueberlauf der Reaktionen (Figma-Hinweis): Ab der 8. Reaktion erscheint eine
 * Pille "+X weitere"; ein Klick zeigt alle und "Weniger anzeigen".
 * Merkt sich, welche Nachrichten aufgeklappt sind (Main-Chat und Thread).
 */
@Injectable({ providedIn: 'root' })
export class ReactionOverflowService {
  readonly limit = REACTION_LIMIT;

  private readonly expanded = signal<ReadonlySet<string>>(new Set());

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

  /** Die anzuzeigenden Reaktionen: zugeklappt nur die ersten 7. */
  visible<T>(items: readonly T[], messageId: string): readonly T[] {
    return this.isExpanded(messageId) ? items : items.slice(0, this.limit);
  }

  /** Wie viele Reaktionen ueber die 7 hinausgehen (0 = kein Ueberlauf). */
  overflow(items: readonly unknown[]): number {
    return Math.max(0, items.length - this.limit);
  }
}
