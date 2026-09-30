import { inject, Injectable, signal } from '@angular/core';
import { ChannelService } from '../channel/channel.service';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { Channel, User } from '../models';
import { UserService } from '../user/user.service';

/** Abschnitt eines Nachrichtentexts: normaler Text, @-Erwaehnung, #-Channel oder Link. */
export interface TextSegment {
  text: string;
  user?: User;
  channel?: Channel;
  href?: string;
}

type MentionTarget = Pick<TextSegment, 'user' | 'channel'>;

/** http(s)-Links; Satzzeichen am Ende gehoeren nicht dazu. */
const URL_PATTERN = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g;

/** Zerlegt normalen Text zusaetzlich in Links. */
function withLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ text: match[0], href: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @-Erwaehnungen und #-Channels: Vorschlagslisten im Eingabefeld und das
 * Hervorheben von "@Name" / "#Channel" in Nachrichten. Kennt nur die fuer den
 * Login sichtbaren User und Channels (Gaeste: Demo-Inhalte), wie die Sidebar.
 */
@Injectable({ providedIn: 'root' })
export class MentionService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);
  private readonly channelService = inject(ChannelService);
  private loading: Promise<void> | null = null;
  /** Fuer wen `loading` geladen wurde; nach einem Kontowechsel wird neu geladen. */
  private loadedFor: string | null = null;

  readonly users = signal<User[]>([]);
  readonly channels = signal<Channel[]>([]);

  /** Einmal pro Konto laden; weitere Aufrufe warten auf denselben Ladevorgang. */
  async ensureLoaded(): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) return;
    if (this.loadedFor !== user.uid) {
      this.loadedFor = user.uid;
      this.loading = this.load(user.isAnonymous);
    }
    return this.loading ?? undefined;
  }

  private async load(isGuest: boolean): Promise<void> {
    await Promise.all([this.refreshUsers(isGuest), this.refreshChannels()]);
  }

  /** Nutzer neu laden (beim Oeffnen der @-Liste, damit neue Namen und Avatare dabei sind). */
  async refreshUsers(isGuest = this.auth.currentUser?.isAnonymous ?? true): Promise<void> {
    this.users.set(await this.userService.listVisibleUsers(isGuest));
  }

  /** Channels neu laden (beim Oeffnen der #-Liste, damit neue Channels dabei sind). */
  async refreshChannels(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    const viewer = { uid: user.uid, isGuest: user.isAnonymous };
    this.channels.set(await this.channelService.listVisibleChannels(viewer));
  }

  /** Vorschlaege zum getippten Text nach dem "@". */
  suggestions(query: string, max = 6): User[] {
    const term = query.toLowerCase();
    return this.users()
      .filter((user) => user.name.toLowerCase().includes(term))
      .slice(0, max);
  }

  /** Vorschlaege zum getippten Text nach dem "#". */
  channelSuggestions(query: string, max = 6): Channel[] {
    const term = query.toLowerCase();
    return this.channels()
      .filter((channel) => channel.name.toLowerCase().includes(term))
      .slice(0, max);
  }

  /** Zerlegt einen Text in normale Abschnitte, "@Name", "#Channel" (nur bekannte) und Links. */
  segments(text: string): TextSegment[] {
    return this.mentionSegments(text).flatMap((part) =>
      part.user || part.channel ? [part] : withLinks(part.text),
    );
  }

  private mentionSegments(text: string): TextSegment[] {
    const targets = this.mentionTargets(text);
    if (targets.size === 0) return [{ text }];
    // Laengere zuerst, damit "@Anna Demo" vor "@Anna" greift.
    const tokens = [...targets.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    const segments: TextSegment[] = [];
    let last = 0;
    for (const match of text.matchAll(new RegExp(tokens.join('|'), 'g'))) {
      if (match.index > last) segments.push({ text: text.slice(last, match.index) });
      segments.push({ text: match[0], ...targets.get(match[0]) });
      last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ text: text.slice(last) });
    return segments;
  }

  /** "@Name" -> User und "#Channel" -> Channel (nur, wenn das Zeichen im Text vorkommt). */
  private mentionTargets(text: string): Map<string, MentionTarget> {
    const targets = new Map<string, MentionTarget>();
    if (text.includes('@')) {
      for (const user of this.users()) if (user.name.trim()) targets.set(`@${user.name}`, { user });
    }
    if (text.includes('#')) {
      for (const channel of this.channels()) if (channel.name.trim()) targets.set(`#${channel.name}`, { channel });
    }
    return targets;
  }
}
