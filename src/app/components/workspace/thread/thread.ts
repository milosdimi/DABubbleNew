import { Component, HostListener, Input, OnDestroy, inject, output, signal } from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { MAIN_CHAT_EMOJIS } from '../main-chat/main-chat-emojis';
import { MainChatDateService } from '../main-chat/main-chat-date.service';
import { MainChatProfileService } from '../main-chat/main-chat-profile.service';
import { AttachmentData, MainChatUploadService } from '../main-chat/main-chat-upload.service';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { ChannelService } from '../../../shared/channel/channel.service';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { MessageService } from '../../../shared/message/message';
import { Message, Reaction } from '../../../shared/models';

/** Zusammenfassung einer Reaction fuer die Anzeige. */
type ReactionGroup = { emoji: string; count: number };

/** Aktuell eingeblendeter Reaction-Tooltip. */
type ReactionTooltip = { replyId: string; emoji: string; text: string };

/**
 * Thread-Panel (Spalte 3): zeigt die Ausgangsnachricht + Antworten eines
 * Threads in Echtzeit, 1:1 im main-chat-Stil (Figma-verifiziert). Absender-
 * profile/Datum/Upload nutzen dieselben Services wie main-chat direkt.
 *
 * Reaction-Logik ist eine eigene Implementierung (nicht MainChatReactionService),
 * weil Thread-Antworten in einer anderen Collection liegen (`.../replies`):
 * addReplyReaction/removeReplyReaction im MessageService finden ueber die
 * Elternnachricht selbst heraus, wohin geschrieben wird (Channel oder Direktchat).
 * Die Emoji-Liste ist dieselbe wie im main-chat (MAIN_CHAT_EMOJIS).
 * TODO: mit MainChatReactionService zusammenfuehren, sobald beide stabil sind.
 */
@Component({
  selector: 'app-thread',
  imports: [Icon, ProfileCard, ClickOutsideDirective],
  providers: [MainChatDateService, MainChatProfileService, MainChatUploadService],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly dateService = inject(MainChatDateService);
  private readonly profileService = inject(MainChatProfileService);
  private readonly uploadService = inject(MainChatUploadService);

  /** Panel wurde geschlossen (X, Escape). */
  readonly closed = output<void>();

  protected readonly parentMessage = signal<Message | null>(null);
  protected readonly replies = signal<Message[]>([]);
  protected readonly channelTag = signal<string | null>(null);
  protected replyText = '';
  protected selectedFile: File | null = null;

  protected readonly reactionOptions = MAIN_CHAT_EMOJIS;
  protected readonly activeReactionReplyId = signal<string | null>(null);
  protected readonly expandedReactionReplyIds = signal<Set<string>>(new Set());
  protected readonly reactionTooltip = signal<ReactionTooltip | null>(null);

  protected readonly selectedProfileUserId = this.profileService.selectedProfileUserId;
  protected readonly activeMessageMenuId = signal<string | null>(null);

  private unsubscribeReplies: Unsubscribe | null = null;
  private tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Setzt die aktuell im Thread geoeffnete Ausgangsnachricht. */
  @Input()
  set message(message: Message | null) {
    this.stopListening();
    this.parentMessage.set(message);
    this.replies.set([]);
    this.channelTag.set(null);
    this.replyText = '';
    this.selectedFile = null;

    if (!message) return;

    void this.profileService.loadSenderProfiles([message]);
    void this.loadChannelTag(message);
    this.subscribeReplies(message);
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  /** Startet den Echtzeit-Listener fuer die Thread-Antworten. */
  private subscribeReplies(message: Message): void {
    this.unsubscribeReplies = this.messageService.subscribeThreadReplies(message, (replies) =>
      this.handleReplies(replies),
    );
  }

  /** Uebernimmt neue Antworten und laedt fehlende Absenderprofile nach. */
  private handleReplies(replies: Message[]): void {
    this.replies.set(replies);
    void this.profileService.loadSenderProfiles(replies);
  }

  /** Beendet einen laufenden Firestore-Listener. */
  private stopListening(): void {
    this.unsubscribeReplies?.();
    this.unsubscribeReplies = null;
  }

  /** Laedt den Channel-Namen als Tag, falls die Nachricht aus einem Channel stammt. */
  private async loadChannelTag(message: Message): Promise<void> {
    if (!message.channelId) return;

    const channel = await this.channelService.getChannel(message.channelId);
    this.channelTag.set(channel?.name ?? null);
  }

  protected getSenderName(senderId: string): string {
    return this.profileService.getSenderName(senderId);
  }

  protected getSenderAvatar(senderId: string): string {
    return this.profileService.getSenderAvatar(senderId);
  }

  protected formatTime(timestamp: number): string {
    return this.profileService.formatMessageTime(timestamp);
  }

  protected isOwnMessage(senderId: string): boolean {
    return this.auth.currentUser?.uid === senderId;
  }

  /** Oeffnet das Profil eines Absenders (Klick auf Avatar oder Name). */
  protected openProfile(senderId: string): void {
    this.profileService.openProfile(senderId);
  }

  /** Schliesst das aktuell geoeffnete Profil. */
  protected closeProfile(): void {
    this.profileService.closeProfile();
  }

  /** Oeffnet oder schliesst das Mehr-Optionen-Menue einer eigenen Antwort. */
  protected toggleMessageMenu(replyId: string): void {
    this.activeMessageMenuId.update((current) => (current === replyId ? null : replyId));
  }

  /** Schliesst das Mehr-Optionen-Menue (z. B. Klick ausserhalb). */
  protected closeMessageMenu(): void {
    this.activeMessageMenuId.set(null);
  }

  /** Schliesst die Emoji-Auswahl (z. B. Klick ausserhalb). */
  protected closeReactionPicker(): void {
    this.activeReactionReplyId.set(null);
  }

  // TODO: Nachricht bearbeiten ist noch nicht angebunden - MessageService hat
  // keine Update-Funktion. Eine editMessage()-Methode sollte Main-Chat und
  // Thread gemeinsam abdecken (gleiche Nachrichten-Struktur; firestore.rules
  // erlauben dem Absender dafuer noch keine Text-Aenderung).
  protected onEditMessage(replyId: string): void {
    console.log('[thread] edit message clicked (not implemented yet)', replyId);
    this.activeMessageMenuId.set(null);
  }

  /** Prueft, ob vor einer Antwort ein Datumstrenner angezeigt wird. */
  protected showDateSeparator(index: number): boolean {
    return this.dateService.showDateSeparator(this.replies(), index);
  }

  protected formatDateSeparator(timestamp: number): string {
    return this.dateService.formatDateSeparator(timestamp);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  /** Uebernimmt den Inhalt des Antwort-Eingabefelds. */
  protected onReplyInput(event: Event): void {
    this.replyText = (event.target as HTMLTextAreaElement).value;
  }

  /** Sendet mit Enter, erlaubt Zeilenumbrueche mit Shift+Enter. */
  protected onEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey) return;

    keyEvent.preventDefault();
    void this.onSendReply();
  }

  /** Bereitet eine ausgewaehlte Datei fuer den Versand vor. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.selectedFile = this.uploadService.prepareSelectedFile(file);
  }

  /** Entfernt die aktuell ausgewaehlte Datei vor dem Senden. */
  protected removeSelectedFile(): void {
    this.selectedFile = null;
  }

  /** Sendet die aktuell eingegebene Antwort mit optionalem Anhang. */
  protected async onSendReply(): Promise<void> {
    const text = this.replyText.trim();
    const parent = this.parentMessage();
    const senderId = this.auth.currentUser?.uid;

    if ((!text && !this.selectedFile) || !parent || !senderId) return;

    const attachment = await this.uploadService.getAttachmentData(this.selectedFile);
    if (!attachment) return;

    await this.saveReply(parent, senderId, text, attachment);
    this.replyText = '';
    this.selectedFile = null;
  }

  /** Speichert die Antwort in Firestore. */
  private async saveReply(
    parent: Message,
    senderId: string,
    text: string,
    attachment: AttachmentData,
  ): Promise<void> {
    await this.messageService.sendThreadReply(
      parent,
      senderId,
      text,
      attachment.path ?? undefined,
      attachment.name ?? undefined,
    );
  }

  /** Oeffnet einen Anhang einer Thread-Antwort. */
  protected async openAttachment(attachmentPath: string): Promise<void> {
    await this.uploadService.openAttachment(attachmentPath);
  }

  // --- Reactions (eigene, generalisierte Kopie - s. Klassenkommentar oben) ---

  /** Liefert die aktuell sichtbaren Reactions einer Antwort. */
  protected getReactionGroups(reply: Message): ReactionGroup[] {
    const groups = this.createSortedReactionGroups(reply);
    const limit = this.getReactionLimit(reply.id);

    return groups.slice(0, limit);
  }

  /** Liefert die Anzahl aktuell ausgeblendeter Reactions. */
  protected getHiddenReactionCount(reply: Message): number {
    const groups = this.createSortedReactionGroups(reply);
    const limit = this.getReactionLimit(reply.id);

    return Math.max(groups.length - limit, 0);
  }

  protected isReactionsExpanded(replyId: string): boolean {
    return this.expandedReactionReplyIds().has(replyId);
  }

  /** Oeffnet oder reduziert die Reaction-Liste einer Antwort. */
  protected toggleReactionList(replyId: string): void {
    this.expandedReactionReplyIds.update((current) => {
      const next = new Set(current);
      if (next.has(replyId)) {
        next.delete(replyId);
      } else {
        next.add(replyId);
      }
      return next;
    });
  }

  private getReactionLimit(replyId: string): number {
    return this.isReactionsExpanded(replyId) ? 20 : 6;
  }

  private createSortedReactionGroups(reply: Message): ReactionGroup[] {
    const counts = new Map<string, number>();

    for (const reaction of reply.reactions ?? []) {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    }

    return [...counts]
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Oeffnet oder schliesst die Emoji-Auswahl fuer eine Antwort. */
  protected toggleReactionPicker(replyId: string): void {
    this.activeReactionReplyId.update((current) => (current === replyId ? null : replyId));
  }

  /** Fuegt eine Reaction hinzu oder entfernt sie wieder, zeigt danach den Tooltip. */
  protected async toggleReaction(reply: Message, emoji: string): Promise<void> {
    const parent = this.parentMessage();
    const userId = this.auth.currentUser?.uid;
    if (!parent || !userId) return;

    const reaction: Reaction = { emoji, userId, messageId: reply.id };
    const wasReacted = this.hasReaction(reply, reaction);

    if (wasReacted) {
      await this.messageService.removeReplyReaction(parent, reply.id, reaction);
    } else {
      await this.messageService.addReplyReaction(parent, reply.id, reaction);
    }

    this.activeReactionReplyId.set(null);

    const reactorIds = this.predictReactorIds(reply, emoji, userId, wasReacted);
    if (reactorIds.length === 0) {
      this.reactionTooltip.set(null);
      return;
    }
    void this.showReactionTooltip(reply.id, emoji, reactorIds);
  }

  /** Prueft, ob der aktuelle User dieselbe Reaction bereits gesetzt hat. */
  private hasReaction(reply: Message, reaction: Reaction): boolean {
    return reply.reactions.some(
      (entry) => entry.userId === reaction.userId && entry.emoji === reaction.emoji,
    );
  }

  /**
   * Berechnet die Reactor-Liste nach dem Toggle, ohne auf den naechsten
   * Firestore-Snapshot zu warten (der kommt erst asynchron etwas spaeter).
   */
  private predictReactorIds(
    reply: Message,
    emoji: string,
    userId: string,
    wasReacted: boolean,
  ): string[] {
    const existing = reply.reactions.filter((r) => r.emoji === emoji).map((r) => r.userId);

    if (wasReacted) return existing.filter((id) => id !== userId);
    return existing.includes(userId) ? existing : [...existing, userId];
  }

  /** Zeigt den Reactor-Tooltip an und blendet ihn nach kurzer Zeit wieder aus. */
  private async showReactionTooltip(
    replyId: string,
    emoji: string,
    reactorIds: string[],
  ): Promise<void> {
    const text = await this.buildReactionTooltipText(reactorIds);
    this.reactionTooltip.set({ replyId, emoji, text });

    if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
    this.tooltipTimeout = setTimeout(() => this.reactionTooltip.set(null), 2500);
  }

  /** Blendet den Tooltip vorzeitig aus (z. B. bei Mouse-Leave). */
  protected hideReactionTooltip(replyId: string): void {
    if (this.reactionTooltip()?.replyId !== replyId) return;

    if (this.tooltipTimeout) clearTimeout(this.tooltipTimeout);
    this.reactionTooltip.set(null);
  }

  /** Baut den Tooltip-Text ("X hat reagiert" / "X und Du haben reagiert"). */
  private async buildReactionTooltipText(reactorIds: string[]): Promise<string> {
    const currentUid = this.auth.currentUser?.uid;
    const names = await Promise.all(
      reactorIds.map((id) =>
        id === currentUid ? Promise.resolve('Du') : this.resolveUserName(id),
      ),
    );
    const ordered = this.moveSelfLast(names);

    if (ordered.length === 1) return `${ordered[0]} hat reagiert`;

    const last = ordered[ordered.length - 1];
    const rest = ordered.slice(0, -1).join(', ');
    return `${rest} und ${last} haben reagiert`;
  }

  /** Stellt sicher, dass "Du" zuletzt genannt wird, falls vorhanden. */
  private moveSelfLast(names: string[]): string[] {
    if (!names.includes('Du')) return names;
    return [...names.filter((name) => name !== 'Du'), 'Du'];
  }

  /** Loest einen Anzeigenamen fuer eine beliebige userId auf (auch ohne eigene Nachricht im Thread). */
  private async resolveUserName(userId: string): Promise<string> {
    const user = await this.profileService.getUser(userId);
    return user?.name ?? 'Jemand';
  }
}
