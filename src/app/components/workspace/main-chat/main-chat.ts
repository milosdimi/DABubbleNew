import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { MessageService } from '../../../shared/message/message';
import { Channel, Message, User } from '../../../shared/models';
import { ChannelInfo } from '../../channel/channel-info/channel-info';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { MainChatDateService } from './main-chat-date.service';
import { MainChatEditService } from './main-chat-edit.service';
import { MainChatProfileService } from './main-chat-profile.service';
import { MainChatReactionService } from './main-chat-reaction.service';
import { MainChatSessionService } from './main-chat-session.service';
import { MainChatUploadService } from './main-chat-upload.service';

/** Mittlere Spalte des Workspace: Nachrichten eines Channels oder Direktchats. */
@Component({
  selector: 'app-main-chat',
  imports: [Icon, ProfileCard, ChannelInfo, ClickOutsideDirective],
  providers: [
    MainChatDateService,
    MainChatEditService,
    MainChatProfileService,
    MainChatReactionService,
    MainChatSessionService,
    MainChatUploadService,
  ],
  templateUrl: './main-chat.html',
  styleUrl: './main-chat.scss',
})
export class MainChat {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly messageService = inject(MessageService);
  protected readonly dates = inject(MainChatDateService);
  protected readonly edit = inject(MainChatEditService);
  protected readonly profiles = inject(MainChatProfileService);
  protected readonly reactions = inject(MainChatReactionService);
  protected readonly session = inject(MainChatSessionService);
  private readonly uploads = inject(MainChatUploadService);

  /** In der Sidebar gewaehlter Channel. */
  readonly channel = input<Channel | null>(null);
  /** In der Sidebar (oder per Profil) gewaehlter Direktchat-Partner. */
  readonly user = input<User | null>(null);

  /** "Antworten" / "X Antworten" angeklickt -> Thread oeffnen. */
  readonly replyClicked = output<Message>();
  /** "+" im Channel-Kopf angeklickt -> Mitglieder-Dialog fuer diesen Channel. */
  readonly addMembersClicked = output<string>();
  /** Aus einem Profil heraus einen Direktchat gestartet -> Sidebar-Markierung angleichen. */
  readonly directChatOpened = output<User>();
  /** Ein Channel wurde ohne Sidebar-Auswahl geoeffnet (Start-Channel). */
  readonly channelOpened = output<Channel>();

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

  protected readonly activePartner = computed(() => {
    const chat = this.active();
    return chat?.kind === 'dm' ? chat.partner : null;
  });

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
      : `Nachricht an ${chat.partner.name}`;
  });

  constructor() {
    effect(() => {
      const channel = this.channel();
      if (channel) untracked(() => this.session.openChannel(channel));
    });

    effect(() => {
      const user = this.user();
      if (user) untracked(() => void this.session.openDirectChat(user));
    });

    // Ohne Auswahl von aussen: ersten sichtbaren Channel zeigen.
    void this.session.openFirstVisibleChannel();

    effect(() => {
      const target = this.session.target();
      untracked(() => {
        // Beim Chatwechsel Entwurf und offene Overlays verwerfen.
        this.resetForNewChat();
        // Channel, den der Main-Chat selbst geoeffnet hat (Start-Channel oder
        // Ruecksprung nach "Channel verlassen"), nach aussen melden.
        const chat = this.active();
        if (target?.kind === 'channel' && chat?.kind === 'channel' && target.id !== this.channel()?.id) {
          this.channelOpened.emit(chat.channel);
        }
      });
    });
  }

  private resetForNewChat(): void {
    this.draft.set('');
    this.selectedFile.set(null);
    this.reactions.closePicker();
    this.edit.cancel();
    this.edit.closeMenu();
    this.profiles.closeProfile();
    this.profiles.closeChannelInfo();
  }

  protected isOwn(message: Message): boolean {
    return message.senderId === this.auth.currentUser?.uid;
  }

  // --- Kopfbereich ------------------------------------------------------------

  protected openChannelInfo(channel: Channel): void {
    this.profiles.openChannelInfo(channel.id);
  }

  protected requestAddMembers(channel: Channel): void {
    this.addMembersClicked.emit(channel.id);
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
    if (file) this.selectedFile.set(this.uploads.prepareSelectedFile(file));
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
      const attachment = await this.uploads.getAttachmentData(this.selectedFile());
      if (!attachment) return; // Upload fehlgeschlagen - Entwurf bleibt erhalten

      await this.messageService.sendMessage(target, senderId, this.draft().trim(), {
        path: attachment.path ?? undefined,
        name: attachment.name ?? undefined,
      });
      this.draft.set('');
      this.selectedFile.set(null);
    } catch (error) {
      // z. B. Zugriff inzwischen entzogen - Entwurf bleibt erhalten.
      console.warn('[main-chat] Nachricht konnte nicht gesendet werden:', error);
    } finally {
      this.sending.set(false);
    }
  }

  protected openAttachment(path: string): void {
    void this.uploads.openAttachment(path);
  }

  // --- Nachricht bearbeiten -----------------------------------------------------

  private persistEdit(message: Message): (text: string) => Promise<void> {
    return (text) => this.messageService.editMessage(message, text);
  }

  protected saveEdit(message: Message): void {
    void this.edit.save(this.persistEdit(message));
  }

  protected onEditKeydown(event: KeyboardEvent, message: Message): void {
    this.edit.onKeydown(event, this.persistEdit(message));
  }

  // --- Thread -----------------------------------------------------------------

  protected openThread(message: Message): void {
    this.replyClicked.emit(message);
  }

  protected replyLabel(count: number): string {
    return count === 1 ? '1 Antwort' : `${count} Antworten`;
  }
}
