import {
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { MAIN_CHAT_EMOJIS, pickerOpensBelow, QUICK_REACTIONS } from '../main-chat/main-chat-emojis';
import { MainChatDateService } from '../main-chat/main-chat-date.service';
import { MainChatEditService } from '../main-chat/main-chat-edit.service';
import { MainChatProfileService } from '../main-chat/main-chat-profile.service';
import { AttachmentData, MainChatUploadService } from '../main-chat/main-chat-upload.service';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { ChannelService } from '../../../shared/channel/channel.service';
import { ChatInputTools } from '../../../shared/chat-input-tools/chat-input-tools';
import { MessageText } from '../../../shared/message-text/message-text';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { TypingIndicator } from '../../../shared/typing/typing-indicator';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { MessageService } from '../../../shared/message/message';
import { Message, Reaction } from '../../../shared/models';
import { MentionService } from '../../../shared/mention/mention.service';
import { autoScrollToLatest } from '../../../shared/scroll/auto-scroll';
import { ReactionOverflowService } from '../../../shared/reactions/reaction-overflow.service';
import { UnreadService } from '../../../shared/unread/unread.service';

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
 */
@Component({
  selector: 'app-thread',
  imports: [Icon, ProfileCard, ClickOutsideDirective, ChatInputTools, TypingIndicator, MessageText],
  providers: [
    MainChatDateService,
    MainChatEditService,
    MainChatProfileService,
    MainChatUploadService,
  ],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly dateService = inject(MainChatDateService);
  protected readonly edit = inject(MainChatEditService);
  private readonly profileService = inject(MainChatProfileService);
  private readonly uploadService = inject(MainChatUploadService);

  /** Panel wurde geschlossen (X, Escape). */
  readonly closed = output<void>();

  protected readonly parentMessage = signal<Message | null>(null);
  protected readonly replies = signal<Message[]>([]);
  protected readonly channelTag = signal<string | null>(null);
  // Signals wie im Main-Chat: Aenderungen nach einem await (z. B. Leeren nach
  // dem Senden) erscheinen sofort, nicht erst beim naechsten Klick.
  protected readonly replyText = signal('');
  protected readonly selectedFile = signal<File | null>(null);

  protected readonly reactionOptions = MAIN_CHAT_EMOJIS;
  protected readonly quickReactions = QUICK_REACTIONS;
  protected readonly activeReactionReplyId = signal<string | null>(null);
  /** Oeffnet der offene Picker nach unten (statt nach oben)? */
  protected readonly reactionPickerBelow = signal(true);
  protected readonly reactionTooltip = signal<ReactionTooltip | null>(null);

  protected readonly selectedProfileUserId = this.profileService.selectedProfileUserId;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  /** Figma: 7 Reaktionen sichtbar, danach "+X weitere". */
  protected readonly overflow = inject(ReactionOverflowService);

  /** "... schreibt gerade" im offenen Thread. */
  protected readonly typingKey = computed(() => {
    const parent = this.parentMessage();
    return parent ? `thread:${parent.id}` : null;
  });

  /** "@Name" in Antworten hervorheben. */
  protected readonly mentions = inject(MentionService);

  constructor() {
    // Offener Thread gilt als gelesen - aber nur bei sichtbarem Tab.
    const unread = inject(UnreadService);
    effect(() => {
      const parent = this.parentMessage();
      const last = this.replies().at(-1);
      if (!parent || !last || !unread.pageVisible()) return;
      untracked(() => unread.markRead(`thread:${parent.id}`, last.timestamp));
    });

    // Immer die neueste Antwort zeigen (Details: autoScrollToLatest).
    autoScrollToLatest({
      scroller: this.scroller,
      messages: this.replies,
      chatKey: computed(() => this.parentMessage()?.id ?? null),
      currentUid: () => this.auth.currentUser?.uid,
    });
  }

  private unsubscribeReplies: Unsubscribe | null = null;
  private tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Setzt die aktuell im Thread geoeffnete Ausgangsnachricht. */
  @Input()
  set message(message: Message | null) {
    this.stopListening();
    this.parentMessage.set(message);
    this.replies.set([]);
    this.channelTag.set(null);
    this.replyText.set('');
    this.selectedFile.set(null);
    this.edit.cancel();
    this.edit.closeMenu();

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

  /** Schliesst die Emoji-Auswahl (z. B. Klick ausserhalb). */
  protected closeReactionPicker(): void {
    this.activeReactionReplyId.set(null);
  }

  // --- Nachricht bearbeiten (gemeinsame Logik: MainChatEditService) ---

  private persistEdit(reply: Message): (text: string) => Promise<void> {
    return (text) => {
      const parent = this.parentMessage();
      if (!parent) return Promise.reject(new Error('Kein Thread geoeffnet'));
      return this.messageService.editReply(parent, reply.id, text);
    };
  }

  protected deleteOwn(reply: Message): void {
    const parent = this.parentMessage();
    if (!parent) return;
    void this.edit.confirmDelete(() => this.messageService.deleteReply(parent, reply.id));
  }

  protected saveEdit(reply: Message): void {
    void this.edit.save(this.persistEdit(reply));
  }

  protected onEditKeydown(event: KeyboardEvent, reply: Message): void {
    this.edit.onKeydown(event, this.persistEdit(reply));
  }

  /** Prueft, ob vor einer Antwort ein Datumstrenner angezeigt wird. */
  protected showDateSeparator(index: number): boolean {
    return this.dateService.showDateSeparator(this.replies(), index);
  }

  protected formatDateSeparator(timestamp: number): string {
    return this.dateService.formatDateSeparator(timestamp);
  }

  /** Escape bricht zuerst eine laufende Bearbeitung ab, sonst schliesst es den Thread. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.edit.editingId()) this.edit.cancel();
    else this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  /** Uebernimmt den Inhalt des Antwort-Eingabefelds. */
  protected onReplyInput(event: Event): void {
    this.replyText.set((event.target as HTMLTextAreaElement).value);
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

    this.selectedFile.set(this.uploadService.prepareSelectedFile(file));
  }

  /** Entfernt die aktuell ausgewaehlte Datei vor dem Senden. */
  protected removeSelectedFile(): void {
    this.selectedFile.set(null);
  }

  /** Sendet die aktuell eingegebene Antwort mit optionalem Anhang. */
  protected async onSendReply(): Promise<void> {
    const text = this.replyText().trim();
    const file = this.selectedFile();
    const parent = this.parentMessage();
    const senderId = this.auth.currentUser?.uid;

    if ((!text && !file) || !parent || !senderId) return;

    const attachment = await this.uploadService.getAttachmentData(file);
    if (!attachment) return;

    await this.saveReply(parent, senderId, text, attachment);
    this.replyText.set('');
    this.selectedFile.set(null);
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

  /** Alle Reactions einer Antwort, haeufigste zuerst. Laut Figma kein "+N"-Overflow. */
  protected getReactionGroups(reply: Message): ReactionGroup[] {
    const counts = new Map<string, number>();

    for (const reaction of reply.reactions ?? []) {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    }

    return [...counts]
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Oeffnet oder schliesst die Emoji-Auswahl fuer eine Antwort. */
  protected toggleReactionPicker(replyId: string, button: HTMLElement): void {
    this.reactionPickerBelow.set(pickerOpensBelow(button));
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
