import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Icon } from '../../../shared/icon/icon';
import { Channel, Message, User } from '../../../shared/models';
import { MessageHit } from '../../../shared/search/search.service';
import { PresenceService } from '../../../shared/presence/presence.service';
import { UnreadService } from '../../../shared/unread/unread.service';
import { ChannelAddMembers } from '../../channel/channel-add-members/channel-add-members';
import { Header } from '../header/header';
import { MainChat } from '../main-chat/main-chat';
import { NewMessage } from '../new-message/new-message';
import { SearchBar } from '../search-bar/search-bar';
import { Sidebar } from '../sidebar/sidebar';
import { Thread } from '../thread/thread';

/** Gleicher Wert wie `$workspace-mobile` in _mixins.scss. */
const MOBILE_QUERY = '(max-width: 900px)';

/** Mobil ist immer nur eine Ansicht sichtbar (Figma 06 Menue, 07 Chat, 08 Thread). */
export type MobileView = 'menu' | 'chat' | 'thread';

/**
 * Workspace-Shell unter /workspace: Header, darunter Sidebar | Main-Chat | Thread.
 * Haelt nur die Auswahl; Daten laden die Spalten selbst. Mobil zeigt sie nur
 * eine der drei Ansichten (`mobileView`), mit Zurueck-Pfeil im Header.
 */
@Component({
  selector: 'app-chat',
  imports: [Header, Sidebar, MainChat, NewMessage, Thread, ChannelAddMembers, Icon, SearchBar],
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

    // Anzahl ungelesener Chats im Browser-Tab: "(2) DABubble".
    const title = inject(Title);
    const unread = inject(UnreadService);
    effect(() => {
      const count = unread.unreadChatCount();
      title.setTitle(count > 0 ? `(${count}) DABubble` : 'DABubble');
    });
    inject(DestroyRef).onDestroy(() => title.setTitle('DABubble'));
    this.watchMobile();
  }

  /** Schmale Ansicht? Dann ist die Sidebar immer da (ohne Reiter zum Einklappen). */
  protected readonly isMobile = signal(false);
  /**
   * Hat der Nutzer selbst einen Chat geoeffnet? Der Start-Channel zaehlt nicht,
   * damit mobil zuerst das Menue erscheint.
   */
  private readonly chatOpened = signal(false);

  protected readonly mobileView = computed<MobileView>(() => {
    if (!this.chatOpened()) return 'menu';
    return this.threadMessage() ? 'thread' : 'chat';
  });

  private watchMobile(): void {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => this.isMobile.set(query.matches);
    update();
    query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
  }

  /** Mobil "Zurueck": Thread -> Chat -> Menue (die Auswahl bleibt fuer den Desktop erhalten). */
  protected goBack(): void {
    if (this.threadMessage()) {
      this.threadMessage.set(null);
      return;
    }
    this.chatOpened.set(false);
    this.composing.set(false);
  }

  /** Vom Nutzer gewaehlt (Sidebar, Suche, Profil): mobil in die Chat-Ansicht wechseln. */
  protected openChannel(channel: Channel): void {
    this.showChannel(channel);
    this.chatOpened.set(true);
  }

  protected openDirectChat(user: User): void {
    this.showDirectChat(user);
    this.chatOpened.set(true);
  }

  protected readonly sidebarOpen = signal(true);
  /** Sidebar gleitet gerade hinein oder hinaus (dann wird ihr Inhalt abgeschnitten). */
  protected readonly sidebarMoving = signal(false);
  /** "Neue Nachricht" statt Main-Chat im Mittelbereich (Main-Chat bleibt im Hintergrund bestehen). */
  protected readonly composing = signal(false);
  protected readonly threadMessage = signal<Message | null>(null);
  /** Nachricht, zu der der Main-Chat springen soll (Suchtreffer). */
  protected readonly focusMessageId = signal<string | null>(null);
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

  protected showMessage(hit: MessageHit): void {
    if (hit.place.kind === 'channel') this.showChannel(hit.place.channel);
    else this.showDirectChat(hit.place.partner);
    this.focusMessageId.set(hit.message.id);
    this.chatOpened.set(true);
  }

  protected startNewMessage(): void {
    this.threadMessage.set(null);
    this.composing.set(true);
    this.chatOpened.set(true);
  }

  protected toggleSidebar(): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sidebarMoving.set(!reduced);
    this.sidebarOpen.update((open) => !open);
  }

  /** Ende des Ein-/Ausklappens: ab jetzt darf die Sidebar wieder ihren Schatten zeigen. */
  protected onSideTransitionEnd(event: TransitionEvent): void {
    if (event.target === event.currentTarget && event.propertyName === 'flex-basis') {
      this.sidebarMoving.set(false);
    }
  }
}
