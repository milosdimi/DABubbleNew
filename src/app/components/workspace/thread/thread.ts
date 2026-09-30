import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  inject,
  Injector,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { MainChatDateService } from '../main-chat/main-chat-date.service';
import { MainChatEditService } from '../main-chat/main-chat-edit.service';
import { MainChatProfileService } from '../main-chat/main-chat-profile.service';
import { MainChatReactionService } from '../main-chat/main-chat-reaction.service';
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
import { ChatTarget } from '../../../shared/message/message';
import { Channel, Message } from '../../../shared/models';
import { MentionService } from '../../../shared/mention/mention.service';
import { autoScrollToLatest } from '../../../shared/scroll/auto-scroll';
import { ReactionOverflowService } from '../../../shared/reactions/reaction-overflow.service';
import { UnreadService } from '../../../shared/unread/unread.service';

/**
 * Thread-Panel (Spalte 3): zeigt die Ausgangsnachricht + Antworten eines
 * Threads in Echtzeit, 1:1 im main-chat-Stil (Figma-verifiziert). Absender-
 * profile/Datum/Upload/Reactions nutzen dieselben Services wie main-chat; fuer
 * Reactions kennt der Service die Elternnachricht (`threadParent`) und schreibt
 * dann in deren Antworten.
 */
@Component({
  selector: 'app-thread',
  imports: [Icon, ProfileCard, ClickOutsideDirective, ChatInputTools, TypingIndicator, MessageText],
  providers: [
    MainChatDateService,
    MainChatEditService,
    MainChatProfileService,
    MainChatReactionService,
    MainChatUploadService,
  ],
  templateUrl: './thread.html',
  styleUrls: [
    './thread.scss',
    './thread-messages.scss',
    './thread-toolbar.scss',
    './thread-input.scss',
  ],
})
export class Thread implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly dateService = inject(MainChatDateService);
  protected readonly edit = inject(MainChatEditService);
  private readonly profileService = inject(MainChatProfileService);
  protected readonly uploadService = inject(MainChatUploadService);

  /** Panel wurde geschlossen (X, Escape). */
  readonly closed = output<void>();
  /** Klick auf "#Channel" in einer Nachricht. */
  readonly channelSelected = output<Channel>();

  protected readonly parentMessage = signal<Message | null>(null);
  protected readonly replies = signal<Message[]>([]);
  protected readonly channelTag = signal<string | null>(null);
  // Signals wie im Main-Chat: Aenderungen nach einem await (z. B. Leeren nach
  // dem Senden) erscheinen sofort, nicht erst beim naechsten Klick.
  protected readonly replyText = signal('');
  protected readonly selectedFile = signal<File | null>(null);

  /** Reactions an Antworten (Picker, Hover-Leiste, Tooltip wie im Main-Chat). */
  protected readonly reactions = inject(MainChatReactionService);

  protected readonly selectedProfileUserId = this.profileService.selectedProfileUserId;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly replyField = viewChild<ElementRef<HTMLTextAreaElement>>('replyField');
  private readonly injector = inject(Injector);
  /** Figma: 7 Reaktionen sichtbar, danach "+X weitere". */
  protected readonly overflow = inject(ReactionOverflowService);

  /** "... schreibt gerade" im offenen Thread. */
  protected readonly typingKey = computed(() => {
    const parent = this.parentMessage();
    return parent ? `thread:${parent.id}` : null;
  });

  /** "@Name" in Antworten hervorheben. */
  protected readonly mentions = inject(MentionService);

  private readonly unread = inject(UnreadService);

  constructor() {
    this.markThreadAsRead();
    this.focusReplyOnOpen();
    // Immer die neueste Antwort zeigen (Details: autoScrollToLatest).
    autoScrollToLatest({
      scroller: this.scroller,
      messages: this.replies,
      chatKey: computed(() => this.parentMessage()?.id ?? null),
      currentUid: () => this.auth.currentUser?.uid,
    });
  }

  /** Wie im Main-Chat: Wer einen Thread oeffnet, kann sofort lostippen. */
  private focusReplyOnOpen(): void {
    const parentId = computed(() => this.parentMessage()?.id ?? null);
    effect(() => {
      if (!parentId()) return;
      afterNextRender(() => this.replyField()?.nativeElement.focus({ preventScroll: true }), {
        injector: this.injector,
      });
    });
  }

  /** Offener Thread gilt als gelesen - aber nur bei sichtbarem Tab. */
  private markThreadAsRead(): void {
    effect(() => {
      const parent = this.parentMessage();
      const last = this.replies().at(-1);
      if (!parent || !last || !this.unread.pageVisible()) return;
      untracked(() => this.unread.markRead(`thread:${parent.id}`, last.timestamp));
    });
  }

  private unsubscribeReplies: Unsubscribe | null = null;

  /** Setzt die aktuell im Thread geoeffnete Ausgangsnachricht. */
  @Input()
  set message(message: Message | null) {
    this.resetFor(message);
    if (!message) return;

    void this.profileService.loadSenderProfiles([message]);
    void this.loadChannelTag(message);
    this.subscribeReplies(message);
  }

  /** Vorherigen Thread schliessen: Listener, Eingabe, Bearbeiten und Picker zuruecksetzen. */
  private resetFor(message: Message | null): void {
    this.stopListening();
    this.parentMessage.set(message);
    this.replies.set([]);
    this.channelTag.set(null);
    this.replyText.set('');
    this.selectedFile.set(null);
    this.edit.cancel();
    this.edit.closeMenu();
    this.reactions.threadParent.set(message);
    this.reactions.closePicker();
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
    input.value = ''; // dieselbe Datei spaeter erneut waehlbar
    const prepared = file ? this.uploadService.prepareSelectedFile(file) : null;
    if (prepared) this.selectedFile.set(prepared);
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

    const target = parent ? this.chatTargetOf(parent) : null;
    if ((!text && !file) || !parent || !senderId || !target) return;

    const attachment = await this.uploadService.getAttachmentData(file, target);
    if (!attachment) return;

    await this.saveReply(parent, senderId, text, attachment);
    this.replyText.set('');
    this.selectedFile.set(null);
  }

  /** Chat der Elternnachricht (dort liegen auch die Anhaenge des Threads). */
  private chatTargetOf(parent: Message): ChatTarget | null {
    if (parent.channelId) return { kind: 'channel', id: parent.channelId };
    if (parent.dmId) return { kind: 'dm', id: parent.dmId };
    return null;
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
}
