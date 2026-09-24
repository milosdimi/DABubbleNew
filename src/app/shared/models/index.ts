/**
 * Firestore-Datenmodell.
 *
 * Collections:
 *   users/{uid}                                  -> User
 *   channels/{channelId}                         -> Channel
 *   channels/{channelId}/messages/{messageId}    -> Message
 *   directChats/{dmId}                           -> DirectChat
 *   directChats/{dmId}/messages/{messageId}      -> Message
 *   .../messages/{messageId}/replies/{replyId}   -> Message (Thread-Antwort)
 *
 * Firestore lehnt explizite `undefined`-Werte ab: optionale Felder nur setzen,
 * wenn tatsaechlich ein Wert vorhanden ist.
 */

// TODO Figma-Wert pruefen: weitere Zustaende (z. B. 'away') vorlaeufig uebernommen.
export type OnlineStatus = 'online' | 'away' | 'offline';

/** Registrierter User. Gaeste (anonymer Login) haben KEIN Dokument. */
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  onlineStatus: OnlineStatus;
  /** Demo-User: als einzige fuer Gaeste sichtbar. */
  isDemo?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  createdBy: string;
  createdAt: number;
  /** Channel ist auch fuer Gaeste sichtbar. */
  guestVisible?: boolean;
}

/** Direktchat zwischen genau zwei Usern. */
export interface DirectChat {
  id: string;
  /** Immer genau zwei UIDs. */
  memberIds: string[];
  createdAt: number;
}

export interface Reaction {
  emoji: string;
  userId: string;
  messageId: string;
}

/** Channel-Nachricht, Direktnachricht oder Thread-Antwort. */
export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  reactions: Reaction[];
  /** Gesetzt bei Channel-Nachrichten (und deren Thread-Antworten). */
  channelId?: string;
  /** Gesetzt bei Direktnachrichten (und deren Thread-Antworten). */
  dmId?: string;
  /** Nur bei Thread-Antworten: ID der Elternnachricht. */
  threadId?: string;
  attachmentPath?: string;
  attachmentName?: string;
  /** Denormalisierter Zaehler fuer den "X Antworten"-Link. */
  replyCount?: number;
  /** Zeitpunkt der neuesten Thread-Antwort ("Letzte Antwort 14:56 Uhr"). */
  lastReplyAt?: number;
}
