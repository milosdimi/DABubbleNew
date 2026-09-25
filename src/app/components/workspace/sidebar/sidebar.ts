import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { ChannelService } from '../../../shared/channel/channel.service';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { Channel, User } from '../../../shared/models';
import { UnreadService } from '../../../shared/unread/unread.service';
import { UserService } from '../../../shared/user/user.service';
import { ChannelAddMembers } from '../../channel/channel-add-members/channel-add-members';
import { ChannelCreate } from '../../channel/channel-create/channel-create';

/** Welcher Dialog der Sidebar gerade offen ist. */
type SidebarDialog = { kind: 'create' } | { kind: 'add-members'; channelId: string } | null;

/** Linke Spalte: Channels und Direktnachrichten, beide live aus Firestore. */
@Component({
  selector: 'app-sidebar',
  imports: [Icon, ChannelCreate, ChannelAddMembers],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly userService = inject(UserService);
  protected readonly unread = inject(UnreadService);
  private readonly destroyRef = inject(DestroyRef);

  /** Markierung kommt von aussen, weil auch der Main-Chat Chats oeffnen kann. */
  readonly activeChannelId = input<string | null>(null);
  readonly activeUserId = input<string | null>(null);

  readonly channelSelected = output<Channel>();
  readonly userSelected = output<User>();
  /** edit_square neben "Devspace" -> "Neue Nachricht" im Mittelbereich. */
  readonly newMessageClicked = output<void>();

  protected readonly channels = signal<Channel[]>([]);
  protected readonly users = signal<User[]>([]);
  protected readonly channelsOpen = signal(true);
  protected readonly usersOpen = signal(true);
  protected readonly dialog = signal<SidebarDialog>(null);
  /** Frisch angelegter Channel, fuer den gerade Mitglieder gewaehlt werden. */
  protected readonly newChannelId = computed(() => {
    const open = this.dialog();
    return open?.kind === 'add-members' ? open.channelId : null;
  });

  protected readonly currentUid = signal<string | null>(null);
  protected readonly isGuest = signal(false);

  /** Eigener User zuerst, danach alphabetisch. */
  protected readonly sortedUsers = computed(() => {
    const own = this.currentUid();
    return [...this.users()].sort((a, b) => {
      if (a.id === own) return -1;
      if (b.id === own) return 1;
      return a.name.localeCompare(b.name, 'de');
    });
  });

  constructor() {
    void this.startListening();
    void this.unread.start(this.destroyRef);
    // Fuer jeden sichtbaren Channel die neueste Nachricht beobachten (rote Punkte).
    effect(() => this.unread.watchChannels(this.channels()));
  }

  private async startListening(): Promise<void> {
    await this.auth.authStateReady();
    const user = this.auth.currentUser;
    if (!user) return;

    this.currentUid.set(user.uid);
    this.isGuest.set(user.isAnonymous);

    const stopChannels = this.channelService.watchVisibleChannels(
      { uid: user.uid, isGuest: user.isAnonymous },
      (channels) => this.channels.set(channels),
    );
    const stopUsers = this.userService.watchVisibleUsers(user.isAnonymous, (users) =>
      this.users.set(users),
    );
    this.destroyRef.onDestroy(() => {
      stopChannels();
      stopUsers();
    });
  }

  protected selectChannel(channel: Channel): void {
    this.channelSelected.emit(channel);
  }

  protected selectUser(user: User): void {
    this.userSelected.emit(user);
  }

  // --- Channel anlegen -> Mitglieder waehlen ------------------------------------

  protected openCreateDialog(): void {
    this.dialog.set({ kind: 'create' });
  }

  protected onChannelCreated(channelId: string): void {
    this.dialog.set({ kind: 'add-members', channelId });
  }

  protected closeDialog(): void {
    this.dialog.set(null);
  }
}
