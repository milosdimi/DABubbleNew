import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Icon } from '../../../shared/icon/icon';
import { Channel, Message, User } from '../../../shared/models';
import { PresenceService } from '../../../shared/presence/presence.service';
import { ChannelAddMembers } from '../../channel/channel-add-members/channel-add-members';
import { Header } from '../header/header';
import { MainChat } from '../main-chat/main-chat';
import { NewMessage } from '../new-message/new-message';
import { Sidebar } from '../sidebar/sidebar';
import { Thread } from '../thread/thread';

/**
 * Workspace-Shell unter /workspace: Header, darunter Sidebar | Main-Chat | Thread.
 * Haelt nur die Auswahl; Daten laden die Spalten selbst.
 */
@Component({
  selector: 'app-chat',
  imports: [Header, Sidebar, MainChat, NewMessage, Thread, ChannelAddMembers, Icon],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  /** Genau eines von beiden ist gesetzt (oder keins, bis der Start-Channel feststeht). */
  protected readonly selectedChannel = signal<Channel | null>(null);
  protected readonly selectedUser = signal<User | null>(null);

  constructor() {
    // Beim Betreten des Workspace den gewaehlten Status anzeigen, beim Verlassen "offline".
    void inject(PresenceService).start(inject(DestroyRef));
  }

  protected readonly sidebarOpen = signal(true);
  /** "Neue Nachricht" statt Main-Chat im Mittelbereich (Main-Chat bleibt im Hintergrund bestehen). */
  protected readonly composing = signal(false);
  protected readonly threadMessage = signal<Message | null>(null);
  /** Channel, fuer den der "+"-Dialog aus dem Main-Chat-Kopf offen ist. */
  protected readonly addMembersChannelId = signal<string | null>(null);

  protected showChannel(channel: Channel): void {
    this.composing.set(false);
    if (channel.id !== this.selectedChannel()?.id) this.threadMessage.set(null);
    this.selectedUser.set(null);
    this.selectedChannel.set(channel);
  }

  protected showDirectChat(user: User): void {
    this.composing.set(false);
    if (user.id !== this.selectedUser()?.id) this.threadMessage.set(null);
    this.selectedChannel.set(null);
    this.selectedUser.set(user);
  }

  protected startNewMessage(): void {
    this.threadMessage.set(null);
    this.composing.set(true);
  }

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
