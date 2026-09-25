import { inject, Injectable, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { User } from '../models';
import { UserService } from '../user/user.service';

/** Abschnitt eines Nachrichtentexts: normaler Text oder eine @-Erwaehnung. */
export interface TextSegment {
  text: string;
  user?: User;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @-Erwaehnungen: Personen fuer die Vorschlagsliste im Eingabefeld und das
 * Hervorheben von "@Name" in Nachrichten. Kennt nur die fuer den Login
 * sichtbaren User (Gaeste: Demo-User), wie die Sidebar.
 */
@Injectable({ providedIn: 'root' })
export class MentionService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);
  private loading: Promise<void> | null = null;

  readonly users = signal<User[]>([]);

  /** Einmalig laden; weitere Aufrufe warten auf denselben Ladevorgang. */
  ensureLoaded(): Promise<void> {
    this.loading ??= (async () => {
      await this.auth.authStateReady();
      const user = this.auth.currentUser;
      if (!user) return;
      this.users.set(await this.userService.listVisibleUsers(user.isAnonymous));
    })();
    return this.loading;
  }

  /** Vorschlaege zum getippten Text nach dem "@". */
  suggestions(query: string, max = 6): User[] {
    const term = query.toLowerCase();
    return this.users()
      .filter((user) => user.name.toLowerCase().includes(term))
      .slice(0, max);
  }

  /** Zerlegt einen Text in normale Abschnitte und "@Name"-Erwaehnungen bekannter User. */
  segments(text: string): TextSegment[] {
    const users = this.users().filter((user) => user.name.trim());
    if (!text.includes('@') || users.length === 0) return [{ text }];

    // Laengere Namen zuerst, damit "@Anna Demo" vor "@Anna" greift.
    const byName = new Map(users.map((user) => [user.name, user]));
    const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const pattern = new RegExp(`@(${names.join('|')})`, 'g');

    const segments: TextSegment[] = [];
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > last) segments.push({ text: text.slice(last, match.index) });
      segments.push({ text: match[0], user: byName.get(match[1]) });
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ text: text.slice(last) });
    return segments;
  }
}
