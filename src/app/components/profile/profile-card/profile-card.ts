import { Component, computed, effect, HostListener, inject, input, output, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { User } from '../../../shared/models';
import { PresenceService } from '../../../shared/presence/presence.service';
import { STATUS_LABELS } from '../../../shared/status/status';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserService } from '../../../shared/user/user.service';
import { ProfileEdit } from '../profile-edit/profile-edit';

/** Anzeige fuer den eigenen Gast-Login (Gaeste haben kein users-Dokument). */
const GUEST_PROFILE: Omit<User, 'id'> = {
  name: 'Gast',
  email: '',
  avatarUrl: 'img/avatar/profile_blank.svg',
  onlineStatus: 'online',
};

/** Profilansicht als Overlay: eigenes Profil (bearbeitbar) oder fremdes (mit "Nachricht"). */
@Component({
  selector: 'app-profile-card',
  imports: [Icon, Spinner, ProfileEdit],
  templateUrl: './profile-card.html',
  styleUrl: './profile-card.scss',
})
export class ProfileCard {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);
  private readonly presence = inject(PresenceService);

  readonly userId = input.required<string>();
  readonly closed = output<void>();
  /** "Nachricht" an diesen User -> Direktchat oeffnen. */
  readonly messageClicked = output<string>();

  protected readonly user = signal<User | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal(false);

  protected readonly isOwn = computed(() => this.userId() === this.auth.currentUser?.uid);
  /** Gast-Sperre: der eigene Gast-Login kann nicht bearbeitet werden. */
  protected readonly isGuestSelf = computed(
    () => this.isOwn() && (this.auth.currentUser?.isAnonymous ?? false),
  );

  /** Angezeigter Status: "offline", wenn der User gerade nicht verbunden ist. */
  protected readonly status = computed(() => {
    const user = this.user();
    return user ? this.presence.effectiveStatus(user) : null;
  });

  protected readonly statusLabel = computed(() => {
    const status = this.status();
    return status ? STATUS_LABELS[status] : '';
  });

  constructor() {
    effect(() => void this.load(this.userId()));
  }

  private async load(uid: string): Promise<void> {
    this.loading.set(true);
    try {
      if (this.isGuestSelf()) {
        this.user.set({ id: uid, ...GUEST_PROFILE });
        return;
      }
      this.user.set(await this.userService.getUser(uid));
    } catch {
      this.user.set(null); // z. B. Gast betrachtet ein Profil, das er nicht lesen darf
    } finally {
      this.loading.set(false);
    }
  }

  /** Escape schliesst die Karte - aber nicht, solange profile-edit offen ist. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (!this.editing()) this.closed.emit();
  }

  protected startEditing(): void {
    if (!this.isGuestSelf()) this.editing.set(true);
  }

  protected onEditSaved(): void {
    this.editing.set(false);
    void this.load(this.userId());
  }
}
