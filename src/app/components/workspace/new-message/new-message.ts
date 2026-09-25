import { Component, computed, inject, output, signal } from '@angular/core';
import { ChannelService } from '../../../shared/channel/channel.service';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { ChatTarget, MessageService } from '../../../shared/message/message';
import { Channel, User } from '../../../shared/models';
import { UserService } from '../../../shared/user/user.service';

/** Gewaehlter Empfaenger: ein Channel oder eine Person (Direktchat). */
export type Recipient = { kind: 'channel'; channel: Channel } | { kind: 'user'; user: User };

const MAX_SUGGESTIONS = 6;

/**
 * "Neue Nachricht" (edit_square neben dem Workspace-Titel): Empfaenger per
 * "#channel", "@name", Name oder E-Mail waehlen, Nachricht schreiben, senden.
 * Danach oeffnet der Workspace den Channel bzw. Direktchat. Nur die Figma-Ikone
 * ist vorgegeben; die Ansicht folgt dem Stil des Main-Chats.
 */
@Component({
  selector: 'app-new-message',
  imports: [Icon, ClickOutsideDirective],
  templateUrl: './new-message.html',
  styleUrl: './new-message.scss',
})
export class NewMessage {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly userService = inject(UserService);

  /** Gesendet -> Workspace oeffnet das Ziel. */
  readonly sentToChannel = output<Channel>();
  readonly sentToUser = output<User>();

  private readonly channels = signal<Channel[]>([]);
  private readonly users = signal<User[]>([]);

  protected readonly recipientQuery = signal('');
  protected readonly suggestionsOpen = signal(false);
  protected readonly recipient = signal<Recipient | null>(null);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currentUid = this.auth.currentUser?.uid ?? null;

  /** "#..." nur Channels, "@..." nur Personen, sonst beides (Name oder E-Mail). */
  protected readonly suggestions = computed(() => {
    const raw = this.recipientQuery().trim();
    const prefix = raw[0] === '#' || raw[0] === '@' ? raw[0] : '';
    const term = (prefix ? raw.slice(1) : raw).trim().toLowerCase();
    if (!raw) return { channels: [], users: [] };

    const channels =
      prefix === '@'
        ? []
        : this.channels().filter((c) => c.name.toLowerCase().includes(term)).slice(0, MAX_SUGGESTIONS);
    const users =
      prefix === '#'
        ? []
        : this.users()
            .filter((u) => u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term))
            .slice(0, MAX_SUGGESTIONS);
    return { channels, users };
  });

  protected readonly canSend = computed(
    () => !this.sending() && this.recipient() !== null && this.draft().trim().length > 0,
  );

  protected readonly placeholder = computed(() => {
    const target = this.recipient();
    if (!target) return 'Nachricht schreiben …';
    return target.kind === 'channel'
      ? `Nachricht an #${target.channel.name}`
      : `Nachricht an ${target.user.name}`;
  });

  constructor() {
    void this.loadRecipients();
  }

  private async loadRecipients(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    const [channels, users] = await Promise.all([
      this.channelService.listVisibleChannels({ uid: user.uid, isGuest: user.isAnonymous }),
      this.userService.listVisibleUsers(user.isAnonymous),
    ]);
    this.channels.set(channels);
    this.users.set(users);
  }

  protected onRecipientInput(event: Event): void {
    this.recipientQuery.set((event.target as HTMLInputElement).value);
    this.suggestionsOpen.set(true);
  }

  protected pick(recipient: Recipient): void {
    this.recipient.set(recipient);
    this.recipientQuery.set('');
    this.suggestionsOpen.set(false);
    this.error.set(null);
  }

  protected clearRecipient(): void {
    this.recipient.set(null);
  }

  protected onDraftInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter sendet, Shift+Enter macht einen Zeilenumbruch (wie im Main-Chat). */
  protected onDraftKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.send();
  }

  protected async send(): Promise<void> {
    const target = this.recipient();
    const senderId = this.auth.currentUser?.uid;
    if (!this.canSend() || !target || !senderId) return;

    this.sending.set(true);
    this.error.set(null);
    try {
      await this.messageService.sendMessage(await this.toChatTarget(target, senderId), senderId, this.draft().trim());
      this.draft.set('');
      if (target.kind === 'channel') this.sentToChannel.emit(target.channel);
      else this.sentToUser.emit(target.user);
    } catch (error) {
      console.warn('[new-message] Nachricht konnte nicht gesendet werden:', error);
      this.error.set('Nachricht konnte nicht gesendet werden. Bitte versuche es erneut.');
    } finally {
      this.sending.set(false);
    }
  }

  private async toChatTarget(target: Recipient, senderId: string): Promise<ChatTarget> {
    if (target.kind === 'channel') return { kind: 'channel', id: target.channel.id };
    const dmId = await this.messageService.getOrCreateDirectChat(senderId, target.user.id);
    return { kind: 'dm', id: dmId };
  }
}
