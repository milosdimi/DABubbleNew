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

/** Aktiv / Abwesend / Nicht stoeren / Offline (Texte: shared/status/status.ts). */
export type OnlineStatus = 'online' | 'away' | 'busy' | 'offline';

/** Registrierter User. Gaeste (anonymer Login) haben KEIN Dokument. */
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  /** Was die anderen sehen (beim Log out "offline"). */
  onlineStatus: OnlineStatus;
  /** Selbst gewaehlter Status; wird beim naechsten Login wieder angezeigt. */
  chosenStatus?: OnlineStatus;
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
  /** Vom Absender geloescht: bleibt als Platzhalter "Diese Nachricht wurde geloescht". */
  deleted?: boolean;
  deletedAt?: number;
  /** Zeitpunkt der letzten Bearbeitung -> Hinweis "(bearbeitet)". */
  editedAt?: number;
  /** Nur bei Thread-Antworten: ID der Elternnachricht. */
  threadId?: string;
  attachmentPath?: string;
  attachmentName?: string;
  /** Denormalisierter Zaehler fuer den "X Antworten"-Link. */
  replyCount?: number;
  /** Zeitpunkt der neuesten Thread-Antwort ("Letzte Antwort 14:56 Uhr"). */
  lastReplyAt?: number;
  /** uid der neuesten Thread-Antwort (fuer den Ungelesen-Punkt am Teaser). */
  lastReplyBy?: string;
}
