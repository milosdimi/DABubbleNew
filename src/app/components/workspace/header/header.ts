import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { signOut } from 'firebase/auth';
import { Unsubscribe } from 'firebase/firestore';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { User } from '../../../shared/models';
import { UserService } from '../../../shared/user/user.service';
import { ProfileCard } from '../../profile/profile-card/profile-card';
import { ProfileMenu } from '../../profile/profile-menu/profile-menu';

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
  imports: [RouterLink, Icon, ProfileMenu, ProfileCard, ClickOutsideDirective],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header implements OnInit {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly destroyRef = inject(DestroyRef);

  readonly variant = input<HeaderVariant>('app');

  protected readonly uid = signal<string | null>(null);
  protected readonly displayName = signal('');
  protected readonly avatarUrl = signal(GUEST_DISPLAY.avatarUrl);
  /** Online-Punkt am Avatar (Gaeste gelten als online). */
  protected readonly online = signal(true);
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
    if (current.isAnonymous) {
      this.show(GUEST_DISPLAY);
      return;
    }
    const stop: Unsubscribe = this.userService.watchUser(current.uid, (user) =>
      this.show(user ?? { name: current.displayName ?? '', avatarUrl: GUEST_DISPLAY.avatarUrl }),
    );
    this.destroyRef.onDestroy(stop);
  }

  private show(user: Pick<User, 'name' | 'avatarUrl'> & Partial<Pick<User, 'onlineStatus'>>): void {
    this.displayName.set(user.name);
    this.avatarUrl.set(user.avatarUrl);
    this.online.set((user.onlineStatus ?? 'online') === 'online');
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected openOwnProfile(): void {
    this.menuOpen.set(false);
    this.profileOpen.set(true);
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await signOut(this.auth);
    await this.router.navigate(['/login']);
  }
}
