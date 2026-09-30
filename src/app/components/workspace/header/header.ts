import { Component, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { signOut } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { Channel, OnlineStatus, User } from '../../../shared/models';
import { PresenceService } from '../../../shared/presence/presence.service';
import { MessageHit } from '../../../shared/search/search.service';
import { UserService } from '../../../shared/user/user.service';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { ProfileMenu } from '../../profile/profile-menu/profile-menu';
import { SearchBar } from '../search-bar/search-bar';

/**
 * - 'auth-login':    Login-Seite, rechts der Hinweis "Konto erstellen"
 * - 'auth-register': uebrige Auth- und Rechtsseiten, nur Logo
 * - 'app':           Workspace, rechts der eingeloggte User mit Profilmenue
 */
export type HeaderVariant = 'auth-login' | 'auth-register' | 'app';

/** Anzeige fuer Gaeste (sie haben kein users-Dokument). */
const GUEST_DISPLAY = { name: 'Gast', avatarUrl: 'img/avatar/profile_blank.svg' };

@Component({
  selector: 'app-header',
  imports: [RouterLink, Icon, ProfileMenu, ProfileCard, ClickOutsideDirective, SearchBar],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly presence = inject(PresenceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly variant = input<HeaderVariant>('app');
  /** Mobil in Chat/Thread: Zurueck-Pfeil statt Logo (nur in der "app"-Variante). */
  readonly showBack = input(false);
  readonly backClicked = output<void>();

  /** Treffer der Suche angeklickt -> Workspace oeffnet Channel bzw. Direktchat. */
  readonly channelSelected = output<Channel>();
  readonly userSelected = output<User>();
  /** Nachrichten-Treffer: Workspace oeffnet den Chat und springt zur Nachricht. */
  readonly messageSelected = output<MessageHit>();

  protected readonly uid = signal<string | null>(null);
  protected readonly displayName = signal('');
  protected readonly avatarUrl = signal(GUEST_DISPLAY.avatarUrl);
  /** Status-Punkt am Avatar (Gaeste gelten als online). */
  protected readonly status = signal<OnlineStatus>('online');
  /** Im Dropdown markierter, selbst gewaehlter Status. */
  protected readonly chosenStatus = signal<OnlineStatus>('online');
  /** Gaeste haben kein Profil und koennen den Status nicht aendern. */
  protected readonly isGuest = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly profileOpen = signal(false);

  ngOnInit(): void {
    if (this.variant() === 'app') void this.watchCurrentUser();
  }

  /** Name und Avatar live halten (z. B. nach dem Bearbeiten des Profils). */
  private async watchCurrentUser(): Promise<void> {
    await this.auth.authStateReady();
    const current = this.auth.currentUser;
    if (!current) return;

    this.uid.set(current.uid);
    this.isGuest.set(current.isAnonymous);
    if (current.isAnonymous) {
      this.show(GUEST_DISPLAY);
      return;
    }
    const stop: Unsubscribe = this.userService.watchUser(current.uid, (user) =>
      this.show(user ?? { name: current.displayName ?? '', avatarUrl: GUEST_DISPLAY.avatarUrl }),
    );
    this.destroyRef.onDestroy(stop);
  }

  private show(
    user: Pick<User, 'name' | 'avatarUrl'> & Partial<Pick<User, 'onlineStatus' | 'chosenStatus'>>,
  ): void {
    this.displayName.set(user.name);
    this.avatarUrl.set(user.avatarUrl);
    this.status.set(user.onlineStatus ?? 'online');
    this.chosenStatus.set(user.chosenStatus ?? user.onlineStatus ?? 'online');
  }

  protected async chooseStatus(status: OnlineStatus): Promise<void> {
    this.menuOpen.set(false);
    await this.presence.choose(status);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected openOwnProfile(): void {
    this.menuOpen.set(false);
    this.profileOpen.set(true);
  }

  /**
   * Erst den Workspace verlassen (beendet alle Listener), dann abmelden. Umgekehrt
   * wuerden laufende Listener kurz ohne Berechtigung lesen und Fehler in die Konsole schreiben.
   */
  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.presence.goOffline();
    await this.router.navigate(['/login']);
    await signOut(this.auth);
  }
}
