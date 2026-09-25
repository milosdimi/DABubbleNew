import { inject, Injectable } from '@angular/core';
import { ChannelService } from '../channel/channel.service';
import { FIREBASE_AUTH } from '../firebase/firebase.tokens';
import { MessageService } from '../message/message';
import { Channel, Message, User } from '../models';
import { UserService } from '../user/user.service';

/** Wo eine gefundene Nachricht steht - dorthin fuehrt ein Klick auf den Treffer. */
export type SearchPlace = { kind: 'channel'; channel: Channel } | { kind: 'dm'; partner: User };

export interface MessageHit {
  message: Message;
  place: SearchPlace;
  senderName: string;
}

export interface SearchResults {
  channels: Channel[];
  users: User[];
  messages: MessageHit[];
}

/** Alles, was der aktuelle Login sehen darf - einmal geladen, dann im Browser durchsucht. */
interface SearchIndex {
  channels: Channel[];
  users: User[];
  messages: MessageHit[];
}

export const EMPTY_RESULTS: SearchResults = { channels: [], users: [], messages: [] };

const MAX_CHANNELS = 5;
const MAX_USERS = 5;
const MAX_MESSAGES = 8;
/** Freitext erst ab 2 Zeichen; mit "#" / "@" reicht schon 1. */
const MIN_TERM_LENGTH = 2;

/**
 * Suche im Header ("Devspace durchsuchen"). Firestore hat keine Volltextsuche,
 * deshalb laedt `loadIndex()` die sichtbaren Channels, User und Nachrichten
 * (Channels + eigene Direktchats, ohne Thread-Antworten) und `search()` filtert
 * lokal. Gelesen wird nur, was die Rules dem Login ohnehin erlauben.
 *
 * Praefixe wie in Slack: "#name" sucht nur Channels, "@name" nur Personen.
 */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly userService = inject(UserService);

  async loadIndex(): Promise<SearchIndex> {
    const current = this.auth.currentUser;
    if (!current) return { channels: [], users: [], messages: [] };

    const isGuest = current.isAnonymous;
    const [channels, users] = await Promise.all([
      this.channelService.listVisibleChannels({ uid: current.uid, isGuest }),
      this.userService.listVisibleUsers(isGuest),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const senderName = (uid: string) => usersById.get(uid)?.name ?? 'Gast';

    const channelHits = channels.map(async (channel) => {
      const messages = await this.messageService.listMessages({ kind: 'channel', id: channel.id });
      const place: SearchPlace = { kind: 'channel', channel };
      return messages.map((message) => ({ message, place, senderName: senderName(message.senderId) }));
    });

    const directChats = await this.messageService.listOwnDirectChats(current.uid);
    const dmHits = directChats.map(async (chat) => {
      // Chat mit sich selbst hat zweimal die eigene uid.
      const partnerId = chat.memberIds.find((id) => id !== current.uid) ?? current.uid;
      const partner = usersById.get(partnerId);
      if (!partner) return [];
      const messages = await this.messageService.listMessages({ kind: 'dm', id: chat.id });
      const place: SearchPlace = { kind: 'dm', partner };
      return messages.map((message) => ({ message, place, senderName: senderName(message.senderId) }));
    });

    const messages = (await Promise.all([...channelHits, ...dmHits]))
      .flat()
      .sort((a, b) => b.message.timestamp - a.message.timestamp); // neueste zuerst

    return { channels, users, messages };
  }

  /** Lang genug zum Suchen? (Freitext ab 2 Zeichen, mit "#" / "@" ab 1.) */
  isSearchable(input: string): boolean {
    return this.parse(input) !== null;
  }

  search(index: SearchIndex, input: string): SearchResults {
    const parsed = this.parse(input);
    if (!parsed) return EMPTY_RESULTS;
    const { prefix, term } = parsed;

    const matches = (text: string) => text.toLowerCase().includes(term);
    return {
      channels: prefix === '@' ? [] : index.channels.filter((c) => matches(c.name)).slice(0, MAX_CHANNELS),
      users: prefix === '#' ? [] : index.users.filter((u) => matches(u.name)).slice(0, MAX_USERS),
      messages: prefix
        ? []
        : index.messages
            .filter((hit) => !hit.message.deleted && matches(hit.message.text))
            .slice(0, MAX_MESSAGES),
    };
  }

  private parse(input: string): { prefix: string; term: string } | null {
    const raw = input.trim();
    const prefix = raw[0] === '#' || raw[0] === '@' ? raw[0] : '';
    const term = (prefix ? raw.slice(1) : raw).trim().toLowerCase();
    if (!term || (!prefix && term.length < MIN_TERM_LENGTH)) return null;
    return { prefix, term };
  }
}
