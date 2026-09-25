import { inject, Injectable } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  CollectionReference,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.tokens';
import { DirectChat, Message, Reaction } from '../models';

/** Wohin eine Nachricht gehoert: in einen Channel oder einen Direktchat. */
export type ChatTarget = { kind: 'channel'; id: string } | { kind: 'dm'; id: string };

/** Optionaler Dateianhang einer Nachricht. */
export interface Attachment {
  path?: string;
  name?: string;
}

/**
 * Zugriff auf Nachrichten in Firestore: Channel-Nachrichten, Direktchats
 * (`directChats`), Reactions und Thread-Antworten.
 */
@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly firestore = inject(FIRESTORE);

  // --- Direktchats ---------------------------------------------------------

  /**
   * Liefert die ID des Direktchats zwischen `uidA` und `uidB` und legt ihn an,
   * falls es noch keinen gibt. (Bewusst ohne Schutz gegen gleichzeitiges
   * doppeltes Anlegen - fuer dieses Projekt nicht noetig.)
   */
  async getOrCreateDirectChat(uidA: string, uidB: string): Promise<string> {
    const chats = collection(this.firestore, 'directChats');
    const mine = await getDocs(query(chats, where('memberIds', 'array-contains', uidA)));
    const existing = mine.docs
      .map((entry) => entry.data() as DirectChat)
      .find((chat) => this.isChatBetween(chat, uidA, uidB));
    if (existing) return existing.id;

    const ref = doc(chats);
    const chat: DirectChat = { id: ref.id, memberIds: [uidA, uidB], createdAt: Date.now() };
    await setDoc(ref, chat);
    return chat.id;
  }

  /** Auch der Chat mit sich selbst (uidA === uidB) wird korrekt erkannt. */
  private isChatBetween(chat: DirectChat, uidA: string, uidB: string): boolean {
    const [first, second] = chat.memberIds;
    return (first === uidA && second === uidB) || (first === uidB && second === uidA);
  }

  // --- Channel- und Direktnachrichten --------------------------------------

  /** Live-Nachrichten eines Channels oder Direktchats, aelteste zuerst. */
  watchMessages(target: ChatTarget, callback: (messages: Message[]) => void): Unsubscribe {
    return this.subscribeMessages(this.messagesOf(target), callback);
  }

  /** Einmalig: alle Nachrichten eines Channels oder Direktchats (z. B. fuer die Suche). */
  async listMessages(target: ChatTarget): Promise<Message[]> {
    const snapshot = await getDocs(query(this.messagesOf(target), orderBy('timestamp', 'asc')));
    return snapshot.docs.map((entry) => entry.data() as Message);
  }

  /** Einmalig: alle Direktchats, an denen `uid` beteiligt ist. */
  async listOwnDirectChats(uid: string): Promise<DirectChat[]> {
    const chats = collection(this.firestore, 'directChats');
    const snapshot = await getDocs(query(chats, where('memberIds', 'array-contains', uid)));
    return snapshot.docs.map((entry) => entry.data() as DirectChat);
  }

  /** Speichert eine neue Nachricht und liefert deren ID. */
  async sendMessage(
    target: ChatTarget,
    senderId: string,
    text: string,
    attachment: Attachment = {},
  ): Promise<string> {
    const ref = doc(this.messagesOf(target));
    const message: Message = {
      id: ref.id,
      senderId,
      text,
      timestamp: Date.now(),
      reactions: [],
    };
    if (target.kind === 'channel') message.channelId = target.id;
    else message.dmId = target.id;
    this.addAttachmentData(message, attachment.path, attachment.name);

    await setDoc(ref, message);
    return message.id;
  }

  /** Reaction an einer Channel- ODER Direktnachricht setzen. */
  async addReaction(message: Message, reaction: Reaction): Promise<void> {
    await updateDoc(this.getParentMessageDoc(message), { reactions: arrayUnion(reaction) });
  }

  /** Reaction an einer Channel- ODER Direktnachricht entfernen. */
  async removeReaction(message: Message, reaction: Reaction): Promise<void> {
    await updateDoc(this.getParentMessageDoc(message), { reactions: arrayRemove(reaction) });
  }

  /** Text einer eigenen Channel- ODER Direktnachricht aendern (Rules: nur Absender, nur `text`). */
  async editMessage(message: Message, text: string): Promise<void> {
    await updateDoc(this.getParentMessageDoc(message), { text });
  }

  // --- Gemeinsame Helfer (auch vom Thread-Teil unten genutzt) --------------

  private messagesOf(target: ChatTarget): CollectionReference {
    return target.kind === 'channel'
      ? collection(this.firestore, 'channels', target.id, 'messages')
      : collection(this.firestore, 'directChats', target.id, 'messages');
  }

  private createChannelMessageDoc(channelId: string, messageId: string) {
    return doc(this.firestore, 'channels', channelId, 'messages', messageId);
  }

  private createDirectMessageDoc(dmId: string, messageId: string) {
    return doc(this.firestore, 'directChats', dmId, 'messages', messageId);
  }

  /** Echtzeit-Listener auf eine Nachrichten-Collection, nach Zeit aufsteigend. */
  private subscribeMessages(
    messages: CollectionReference,
    callback: (messages: Message[]) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(messages, orderBy('timestamp', 'asc')),
      (snapshot) => callback(snapshot.docs.map((entry) => entry.data() as Message)),
      // z. B. nach "Channel verlassen": Rules verweigern weiteres Lesen.
      (error) => console.warn('[messages] Listener beendet:', error.code),
    );
  }

  /** Setzt Anhangsfelder nur, wenn vorhanden (Firestore lehnt `undefined` ab). */
  private addAttachmentData(message: Message, path?: string, name?: string): void {
    if (path) message.attachmentPath = path;
    if (name) message.attachmentName = name;
  }

  // --- Threads -------------------------------------------------------------

  /** Beobachtet die Antworten eines Threads in Echtzeit. */
  subscribeThreadReplies(
    parentMessage: Message,
    callback: (replies: Message[]) => void,
  ): Unsubscribe {
    const replies = this.createThreadRepliesCollection(parentMessage);

    return this.subscribeMessages(replies, callback);
  }

  /** Liefert die Antworten-Collection einer Channel- oder Direktnachricht. */
  private createThreadRepliesCollection(parentMessage: Message) {
    if (parentMessage.channelId) {
      return collection(
        this.firestore,
        'channels',
        parentMessage.channelId,
        'messages',
        parentMessage.id,
        'replies',
      );
    }

    return collection(
      this.firestore,
      'directChats',
      parentMessage.dmId ?? '',
      'messages',
      parentMessage.id,
      'replies',
    );
  }

  /** Speichert eine Antwort innerhalb eines Threads. */
  async sendThreadReply(
    parentMessage: Message,
    senderId: string,
    text: string,
    attachmentPath?: string,
    attachmentName?: string,
  ): Promise<string> {
    const replies = this.createThreadRepliesCollection(parentMessage);

    const ref = doc(replies);
    const reply = this.createThreadReply(ref.id, parentMessage, senderId, text);

    this.addAttachmentData(reply, attachmentPath, attachmentName);

    await setDoc(ref, reply);
    await this.incrementReplyCount(parentMessage, reply.timestamp, senderId);

    return reply.id;
  }

  /** Erhoeht den Antworten-Zaehler der Elternnachricht und merkt sich die Zeit der Antwort. */
  private async incrementReplyCount(
    parentMessage: Message,
    repliedAt: number,
    repliedBy: string,
  ): Promise<void> {
    const ref = this.getParentMessageDoc(parentMessage);
    await updateDoc(ref, { replyCount: increment(1), lastReplyAt: repliedAt, lastReplyBy: repliedBy });
  }

  /** Liefert die Dokument-Referenz einer Channel- oder Direktnachricht. */
  private getParentMessageDoc(message: Message) {
    if (message.channelId) {
      return this.createChannelMessageDoc(message.channelId, message.id);
    }
    return this.createDirectMessageDoc(message.dmId ?? '', message.id);
  }

  /** Erstellt das Grundobjekt einer Thread-Antwort. */
  private createThreadReply(
    id: string,
    parentMessage: Message,
    senderId: string,
    text: string,
  ): Message {
    const reply: Message = {
      id,
      threadId: parentMessage.id,
      senderId,
      text,
      timestamp: Date.now(),
      reactions: [],
    };

    // Firestore lehnt explizite `undefined`-Werte ab - nur das jeweils
    // vorhandene Feld setzen (Channel- oder Direktchat-Nachricht).
    if (parentMessage.channelId) reply.channelId = parentMessage.channelId;
    if (parentMessage.dmId) reply.dmId = parentMessage.dmId;

    return reply;
  }

  /** Fuegt einer Thread-Antwort eine Reaction hinzu. */
  async addReplyReaction(
    parentMessage: Message,
    replyId: string,
    reaction: Reaction,
  ): Promise<void> {
    const ref = this.createThreadReplyDoc(parentMessage, replyId);

    await updateDoc(ref, {
      reactions: arrayUnion(reaction),
    });
  }

  /** Entfernt eine Reaction von einer Thread-Antwort. */
  async removeReplyReaction(
    parentMessage: Message,
    replyId: string,
    reaction: Reaction,
  ): Promise<void> {
    const ref = this.createThreadReplyDoc(parentMessage, replyId);

    await updateDoc(ref, {
      reactions: arrayRemove(reaction),
    });
  }

  /** Text einer eigenen Thread-Antwort aendern (Rules: nur Absender, nur `text`). */
  async editReply(parentMessage: Message, replyId: string, text: string): Promise<void> {
    await updateDoc(this.createThreadReplyDoc(parentMessage, replyId), { text });
  }

  /** Liefert die Referenz zu einer vorhandenen Thread-Antwort. */
  private createThreadReplyDoc(parentMessage: Message, replyId: string) {
    return doc(this.createThreadRepliesCollection(parentMessage), replyId);
  }
}
