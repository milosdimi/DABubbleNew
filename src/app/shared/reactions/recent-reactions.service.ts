import { inject, Injectable, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';

/** Figma-Standard in der Hover-Leiste, solange noch nichts genutzt wurde. */
const DEFAULT_QUICK_REACTIONS: readonly string[] = ['✅', '👍'];
const QUICK_COUNT = 2;
const STORAGE_PREFIX = 'dabubble.recentReactions.';

/**
 * Die zwei zuletzt genutzten Reaktionen fuer die Hover-Leiste (Main-Chat und Thread).
 * Pro User im Browser gespeichert; ohne Verlauf gelten die Figma-Standards.
 */
@Injectable({ providedIn: 'root' })
export class RecentReactionsService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly cache = new Map<string, readonly string[]>();
  /** Loest ein Neuzeichnen aus, sobald sich der Verlauf aendert. */
  private readonly version = signal(0);

  quickReactions(): readonly string[] {
    this.version();
    const recent = this.recent();
    const defaults = DEFAULT_QUICK_REACTIONS.filter((emoji) => !recent.includes(emoji));
    return [...recent, ...defaults].slice(0, QUICK_COUNT);
  }

  /** Nach dem Setzen einer Reaktion aufrufen: `emoji` wird zur neuesten. */
  remember(emoji: string): void {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    const next = [emoji, ...this.recent().filter((used) => used !== emoji)].slice(0, QUICK_COUNT);
    this.cache.set(uid, next);
    this.save(uid, next);
    this.version.update((value) => value + 1);
  }

  private recent(): readonly string[] {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return [];
    if (!this.cache.has(uid)) this.cache.set(uid, this.load(uid));
    return this.cache.get(uid) ?? [];
  }

  private load(uid: string): readonly string[] {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + uid) ?? '[]');
      return Array.isArray(stored) ? stored.filter((emoji) => typeof emoji === 'string') : [];
    } catch {
      return [];
    }
  }

  private save(uid: string, emojis: readonly string[]): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(emojis));
    } catch {
      // Ohne Speicher (z. B. privater Modus) gilt der Verlauf nur bis zum Neuladen.
    }
  }
}
