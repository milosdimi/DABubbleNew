import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { ChannelService } from '../../../shared/channel/channel.service';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { ChatTarget, MessageService } from '../../../shared/message/message';
import { Channel, Message, User } from '../../../shared/models';
import { MainChatProfileService } from './main-chat-profile.service';

/** Der gerade offene Chat: ein Channel ODER ein Direktchat, nie beides. */
export type ActiveChat =
  | { kind: 'channel'; channel: Channel }
  | { kind: 'dm'; partner: User; dmId: string };

/**
 * Haelt den aktiven Chat des Main-Chats und dessen Live-Nachrichten.
 * Wird per `providers` in der Main-Chat-Komponente bereitgestellt.
 */
@Injectable()
export class MainChatSessionService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly messageService = inject(MessageService);
  private readonly profileService = inject(MainChatProfileService);

  private stopListening: Unsubscribe | null = null;
  private stopChannelWatch: Unsubscribe | null = null;
  /** Hochgezaehlt bei jedem Wechsel; verwirft Ergebnisse ueberholter Wechsel. */
  private switchCount = 0;

  readonly active = signal<ActiveChat | null>(null);
  readonly messages = signal<Message[]>([]);

  /**
   * Ziel fuer neue Nachrichten, oder null solange kein Chat offen ist.
   * Aendert sich nur bei einem echten Chatwechsel - nicht, wenn sich z. B.
   * Name oder Mitglieder des offenen Channels aktualisieren.
   */
  readonly target = computed<ChatTarget | null>(
    () => {
      const chat = this.active();
      if (!chat) return null;
      return chat.kind === 'channel'
        ? { kind: 'channel', id: chat.channel.id }
        : { kind: 'dm', id: chat.dmId };
    },
    { equal: (a, b) => a?.kind === b?.kind && a?.id === b?.id },
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detach());
  }

  /** Oeffnet einen Channel. Ein erneuter Klick auf den offenen Channel aendert nichts. */
  openChannel(channel: Channel): void {
    const current = this.active();
    // Bereits offen: nichts tun, watchActiveChannel haelt die Daten ohnehin aktuell.
    if (current?.kind === 'channel' && current.channel.id === channel.id) return;
    this.switchCount++;
    this.attach({ kind: 'channel', channel });
  }

  /** Oeffnet den Direktchat mit `partner` (legt ihn bei Bedarf an). */
  async openDirectChat(partner: User): Promise<void> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    const current = this.active();
    if (current?.kind === 'dm' && current.partner.id === partner.id) return;

    const ticket = ++this.switchCount;
    const dmId = await this.messageService.getOrCreateDirectChat(uid, partner.id);
    if (ticket !== this.switchCount) return; // inzwischen anderer Chat gewaehlt

    this.attach({ kind: 'dm', partner, dmId });
  }

  /** Oeffnet den ersten fuer den aktuellen Login sichtbaren Channel. */
  async openFirstVisibleChannel(): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    const ticket = this.switchCount;

    const channels = await this.channelService.listVisibleChannels({
      uid: user?.uid ?? null,
      isGuest: user?.isAnonymous ?? false,
    });
    if (ticket !== this.switchCount || this.active()) return;
    if (channels[0]) this.openChannel(channels[0]);
  }

  private attach(chat: ActiveChat): void {
    this.detach();
    this.active.set(chat);
    this.messages.set([]);

    const target = this.target();
    if (!target) return;
    this.stopListening = this.messageService.watchMessages(target, (messages) => {
      this.messages.set(messages);
      void this.profileService.loadSenderProfiles(messages);
    });

    if (chat.kind === 'channel') this.watchActiveChannel(chat.channel.id);
  }

  /**
   * Haelt Name/Mitglieder des offenen Channels aktuell. Geht der Zugriff
   * verloren (z. B. "Channel verlassen"), wird auf den ersten sichtbaren
   * Channel gewechselt.
   */
  private watchActiveChannel(channelId: string): void {
    const isStillActive = () => {
      const chat = this.active();
      return chat?.kind === 'channel' && chat.channel.id === channelId;
    };

    this.stopChannelWatch = this.channelService.watchChannel(
      channelId,
      (channel) => {
        if (isStillActive()) this.active.set({ kind: 'channel', channel });
      },
      () => {
        if (!isStillActive()) return;
        this.detach();
        this.active.set(null);
        this.messages.set([]);
        void this.openFirstVisibleChannel();
      },
    );
  }

  private detach(): void {
    this.stopListening?.();
    this.stopListening = null;
    this.stopChannelWatch?.();
    this.stopChannelWatch = null;
  }
}
