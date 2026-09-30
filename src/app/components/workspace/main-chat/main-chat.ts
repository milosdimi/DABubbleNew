import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ChatInputTools } from '../../../shared/chat-input-tools/chat-input-tools';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { TypingIndicator } from '../../../shared/typing/typing-indicator';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { ChatTarget, MessageService } from '../../../shared/message/message';
import { Channel, Message, User } from '../../../shared/models';
import { MentionService } from '../../../shared/mention/mention.service';
import { AutoScroll, autoScrollToLatest } from '../../../shared/scroll/auto-scroll';
import { PresenceService } from '../../../shared/presence/presence.service';
import { UnreadService } from '../../../shared/unread/unread.service';
import { ChannelInfo } from '../../channel/channel-info/channel-info';
import { ChannelMembers } from '../../channel/channel-members/channel-members';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { MainChatDateService } from './main-chat-date.service';
import { MainChatEditService } from './main-chat-edit.service';
import { MainChatProfileService } from './main-chat-profile.service';
import { MainChatReactionService } from './main-chat-reaction.service';
import { MainChatSessionService } from './main-chat-session.service';
import { MainChatUploadService } from './main-chat-upload.service';
import { MainChatMessage } from './main-chat-message/main-chat-message';

/** Mittlere Spalte des Workspace: Nachrichten eines Channels oder Direktchats. */
@Component({
  selector: 'app-main-chat',
  imports: [Icon, ProfileCard, ChannelInfo, ChannelMembers, ChatInputTools, TypingIndicator, MainChatMessage],
  providers: [
    MainChatDateService,
    MainChatEditService,
    MainChatProfileService,
    MainChatReactionService,
    MainChatSessionService,
    MainChatUploadService,
  ],
  templateUrl: './main-chat.html',
  // Aufgeteilt, damit jede Datei unter dem Budget von 10 kB pro Stylesheet bleibt.
  styleUrls: [
    './main-chat.scss',
    './main-chat-messages.scss',
    './main-chat-input.scss',
  ],
})
export class MainChat {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly messageService = inject(MessageService);
  protected readonly dates = inject(MainChatDateService);
  protected readonly edit = inject(MainChatEditService);
  protected readonly profiles = inject(MainChatProfileService);
  protected readonly reactions = inject(MainChatReactionService);
  protected readonly session = inject(MainChatSessionService);
  protected readonly uploads = inject(MainChatUploadService);

  /** In der Sidebar gewaehlter Channel. */
  readonly channel = input<Channel | null>(null);
  /** In der Sidebar (oder per Profil) gewaehlter Direktchat-Partner. */
  readonly user = input<User | null>(null);
  /** Zu dieser Nachricht springen und sie kurz hervorheben (Suchtreffer). */
  readonly focusMessageId = input<string | null>(null);
  readonly focusHandled = output<void>();

  /** "Antworten" / "X Antworten" angeklickt -> Thread oeffnen. */
  readonly replyClicked = output<Message>();
  /** "+" im Channel-Kopf angeklickt -> Mitglieder-Dialog fuer diesen Channel. */
  readonly addMembersClicked = output<string>();
  /** Aus einem Profil heraus einen Direktchat gestartet -> Sidebar-Markierung angleichen. */
  readonly directChatOpened = output<User>();
  /** Ein Channel wurde ohne Sidebar-Auswahl geoeffnet (Start-Channel, Klick auf "#Channel"). */
  readonly channelOpened = output<Channel>();

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly draftField = viewChild<ElementRef<HTMLTextAreaElement>>('draftField');
  /** Gelesen-Stand beim Oeffnen des Chats (fuer die Trennlinie "Neue Nachrichten"). */
  private readonly readMark = signal<number | null>(null);
  /** Erste Nachricht von jemand anderem nach dem Gelesen-Stand. */
  protected readonly firstUnreadId = computed(() => {
    const mark = this.readMark();
    if (mark === null) return null;
    const own = this.auth.currentUser?.uid;
    return this.messages().find((m) => m.senderId !== own && m.timestamp > mark)?.id ?? null;
  });
  /** Tippende im offenen Chat anzeigen / eigenes Tippen melden. */
  protected readonly typingKey = computed(() => {
    const target = this.session.target();
    return target ? `${target.kind}:${target.id}` : null;
  });

  /** Kurz hervorgehobene Nachricht nach einem Sprung. */
  protected readonly highlightedId = signal<string | null>(null);
  private readonly injector = inject(Injector);
  protected readonly unread = inject(UnreadService);
  protected readonly presence = inject(PresenceService);
  /** "@Name" in Nachrichten hervorheben (Liste der sichtbaren User). */
  protected readonly mentions = inject(MentionService);

  /** Mitgliederliste (Figma "43. Members") offen? */
  protected readonly membersOpen = signal(false);
  protected readonly currentUid = computed(() => this.auth.currentUser?.uid ?? null);

  /** Hoechstens drei ueberlappende Avatare im Channel-Kopf. */
  protected readonly headMemberIds = computed(() => this.activeChannel()?.memberIds.slice(0, 3) ?? []);

  protected readonly draft = signal('');
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly sending = signal(false);

  protected readonly active = this.session.active;
  protected readonly messages = this.session.messages;

  protected readonly activeChannel = computed(() => {
    const chat = this.active();
    return chat?.kind === 'channel' ? chat.channel : null;
  });

  /** Nur registrierte Mitglieder duerfen Leute hinzufuegen (wie in firestore.rules). */
  protected readonly canAddMembers = computed(() => {
    const channel = this.activeChannel();
    const user = this.auth.currentUser;
    return !!channel && !!user && !user.isAnonymous && channel.memberIds.includes(user.uid);
  });

  /** DM-Partner mit dem Live-Profil (neuer Name/Avatar erscheint sofort). */
  protected readonly activePartner = computed(() => {
    const chat = this.active();
    if (chat?.kind !== 'dm') return null;
    return this.profiles.cachedUser(chat.partner.id) ?? chat.partner;
  });

  /** Direktchat mit sich selbst ("Notizen"): eigener Leerzustand und "(Du)". */
  protected readonly isSelfChat = computed(() => this.activePartner()?.id === this.currentUid());

  protected readonly canSend = computed(
    () =>
      !this.sending() &&
      this.session.target() !== null &&
      (this.draft().trim().length > 0 || this.selectedFile() !== null),
  );

  // Figma: "Nachricht an Sofia Müller" (DM); Channel-Variante analog.
  protected readonly placeholder = computed(() => {
    const chat = this.active();
    if (!chat) return 'Nachricht schreiben...';
    return chat.kind === 'channel'
      ? `Nachricht an #${chat.channel.name}`
      : `Nachricht an ${this.activePartner()?.name}${this.isSelfChat() ? ' (Du)' : ''}`;
  });

  constructor() {
    this.openSelectedChat();
    const autoScroll = this.scrollToLatest();
    this.jumpToFocusedMessage(autoScroll);
    this.rememberReadMark();
    this.markOpenChatAsRead();
    this.loadHeadMemberProfiles();
    this.focusDraftOnChatSwitch();
    // Ohne Auswahl von aussen: ersten sichtbaren Channel zeigen.
    void this.session.openFirstVisibleChannel();
    this.resetOnChatSwitch();
  }

  /** In der Sidebar gewaehlten Channel bzw. Direktchat oeffnen. */
  private openSelectedChat(): void {
    effect(() => {
      const channel = this.channel();
      if (channel) untracked(() => this.session.openChannel(channel));
    });
    effect(() => {
      const user = this.user();
      if (user) untracked(() => void this.session.openDirectChat(user));
    });
  }

  /** Immer die neueste Nachricht zeigen (Details: autoScrollToLatest). */
  private scrollToLatest(): AutoScroll {
    return autoScrollToLatest({
      scroller: this.scroller,
      messages: this.messages,
      chatKey: this.typingKey,
      currentUid: () => this.auth.currentUser?.uid,
    });
  }

  /** Suchtreffer: sobald die Nachricht geladen ist, dorthin springen. */
  private jumpToFocusedMessage(autoScroll: AutoScroll): void {
    effect(() => {
      const id = this.focusMessageId();
      if (!id || !this.messages().some((message) => message.id === id)) return;
      untracked(() => {
        autoScroll.holdPosition();
        afterNextRender(() => this.highlightMessage(id, autoScroll), { injector: this.injector });
      });
    });
  }

  private highlightMessage(id: string, autoScroll: AutoScroll): void {
    const element = this.scroller()?.nativeElement.querySelector(`[data-message-id="${id}"]`);
    element?.scrollIntoView({ block: 'center' });
    autoScroll.holdPosition(); // falls der Sprung nach unten schon eingeplant war
    this.highlightedId.set(id);
    setTimeout(() => this.highlightedId.set(null), 2000);
    this.focusHandled.emit();
  }

  /** Gelesen-Stand beim Oeffnen merken, bevor der Chat als gelesen markiert wird. */
  private rememberReadMark(): void {
    effect(() => {
      const key = this.typingKey();
      untracked(() => this.readMark.set(key ? this.unread.lastReadAt(key) : null));
    });
  }

  /** Offener Chat gilt als gelesen - aber nur, wenn der Tab sichtbar ist. */
  private markOpenChatAsRead(): void {
    effect(() => {
      const key = this.typingKey();
      const last = this.messages().at(-1);
      if (!key || !last || !this.unread.pageVisible()) return;
      untracked(() => this.unread.markRead(key, last.timestamp));
    });
  }

  /** Profile der Mitglieder (Avatare im Kopf) bzw. des DM-Partners laden. */
  private loadHeadMemberProfiles(): void {
    effect(() => {
      const chat = this.active();
      const uids = chat?.kind === 'dm' ? [chat.partner.id] : this.headMemberIds();
      untracked(() => void this.profiles.loadProfiles(uids));
    });
  }

  /**
   * Beim Chatwechsel Entwurf und offene Overlays verwerfen. Einen Channel, den der
   * Main-Chat selbst geoeffnet hat (Start-Channel oder Ruecksprung nach "Channel
   * verlassen"), nach aussen melden.
   */
  private resetOnChatSwitch(): void {
    effect(() => {
      const target = this.session.target();
      untracked(() => {
        this.resetForNewChat();
        const chat = this.active();
        if (target?.kind === 'channel' && chat?.kind === 'channel' && target.id !== this.channel()?.id) {
          this.channelOpened.emit(chat.channel);
        }
      });
    });
  }

  /** Checkliste: nach jedem Chatwechsel sofort losschreiben koennen (Fokus ins Eingabefeld). */
  private focusDraftOnChatSwitch(): void {
    const activeKey = computed(() => {
      const chat = this.active();
      if (!chat) return null;
      return chat.kind === 'channel' ? `channel:${chat.channel.id}` : `dm:${chat.partner.id}`;
    });
    effect(() => {
      if (!activeKey()) return;
      afterNextRender(() => this.draftField()?.nativeElement.focus({ preventScroll: true }), { injector: this.injector });
    });
  }

  private resetForNewChat(): void {
    this.draft.set('');
    this.selectedFile.set(null);
    this.uploads.error.set(null);
    this.reactions.closePicker();
    this.edit.cancel();
    this.edit.closeMenu();
    this.membersOpen.set(false);
    this.profiles.closeProfile();
    this.profiles.closeChannelInfo();
  }

  // --- Kopfbereich ------------------------------------------------------------

  protected openChannelInfo(channel: Channel): void {
    this.profiles.openChannelInfo(channel.id);
  }

  protected requestAddMembers(channel: Channel): void {
    this.membersOpen.set(false);
    this.addMembersClicked.emit(channel.id);
  }

  /** Aus der mobilen Channel-Info: Info schliessen, dann "Mitglieder hinzufuegen". */
  protected addMembersFromInfo(): void {
    const channel = this.activeChannel();
    this.profiles.closeChannelInfo();
    if (channel) this.requestAddMembers(channel);
  }

  protected openProfileFromInfo(uid: string): void {
    this.profiles.closeChannelInfo();
    this.openMemberProfile(uid);
  }

  protected openMemberProfile(uid: string): void {
    this.membersOpen.set(false);
    this.profiles.openProfile(uid);
  }

  /** "Nachricht" in einer profile-card: Direktchat mit diesem User oeffnen. */
  protected async messageUser(uid: string): Promise<void> {
    const user = await this.profiles.getUser(uid);
    this.profiles.closeProfile();
    if (!user) return;
    await this.session.openDirectChat(user);
    this.directChatOpened.emit(user);
  }

  // --- Eingabe ----------------------------------------------------------------

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter sendet, Shift+Enter macht einen Zeilenumbruch. */
  protected onDraftKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.send();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // dieselbe Datei spaeter erneut waehlbar
    const prepared = file ? this.uploads.prepareSelectedFile(file) : null;
    if (prepared) this.selectedFile.set(prepared);
  }

  protected removeFile(): void {
    this.selectedFile.set(null);
  }

  protected async send(): Promise<void> {
    const target = this.session.target();
    const senderId = this.auth.currentUser?.uid;
    if (!this.canSend() || !target || !senderId) return;

    this.sending.set(true);
    try {
      await this.deliver(target, senderId);
    } catch (error) {
      // z. B. Zugriff inzwischen entzogen - Entwurf bleibt erhalten.
      console.warn('[main-chat] Nachricht konnte nicht gesendet werden:', error);
    } finally {
      this.sending.set(false);
    }
  }

  /** Anhang hochladen, dann senden. Schlaegt der Upload fehl, bleibt der Entwurf erhalten. */
  private async deliver(target: ChatTarget, senderId: string): Promise<void> {
    const attachment = await this.uploads.getAttachmentData(this.selectedFile(), target);
    if (!attachment) return;
    await this.messageService.sendMessage(target, senderId, this.draft().trim(), {
      path: attachment.path ?? undefined,
      name: attachment.name ?? undefined,
    });
    this.draft.set('');
    this.selectedFile.set(null);
  }

  // --- Thread -----------------------------------------------------------------

  protected openThread(message: Message): void {
    this.replyClicked.emit(message);
  }
}
