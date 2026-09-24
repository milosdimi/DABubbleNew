import { Component, computed, HostListener, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { onAuthStateChanged } from 'firebase/auth';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserService } from '../../../shared/user/user.service';
import { Toast } from '../../overlay/toast/toast';

const AVATARS = ['avatar01', 'avatar02', 'avatar03', 'avatar04', 'avatar05', 'avatar06'];
const BLANK_AVATAR = 'profile_blank';

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length === 0 ? { blank: true } : null;
}

/**
 * Modal-Dialog "Dein Profil bearbeiten". Kein eigener Route-Pfad, gleiches
 * Output-Pattern wie channel-create: Parent steuert das Ein-/Ausblenden.
 */
@Component({
  selector: 'app-profile-edit',
  imports: [ReactiveFormsModule, Icon, Spinner, Toast],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.scss',
})
export class ProfileEdit {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly userService = inject(UserService);

  /** Dialog wurde ohne zu speichern geschlossen (X, Escape, Backdrop, Abbrechen). */
  readonly closed = output<void>();
  /** Profil erfolgreich gespeichert; Dialog schliessen. */
  readonly saved = output<void>();

  protected readonly avatarChoices = [...AVATARS, BLANK_AVATAR];
  protected readonly avatar = signal(BLANK_AVATAR);
  private readonly initialAvatar = signal(BLANK_AVATAR);
  protected readonly avatarPickerOpen = signal(false);

  protected readonly loading = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly leaving = signal(false);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank],
    }),
  });

  private readonly status = toSignal(this.form.controls.name.statusChanges, {
    initialValue: this.form.controls.name.status,
  });
  protected readonly formInvalid = computed(() => this.status() !== 'VALID');

  constructor() {
    void this.loadUser();
  }

  private async loadUser(): Promise<void> {
    const uid = await this.resolveUid();
    if (!uid) return;

    const user = await this.userService.getUser(uid);
    if (!user) return;

    this.form.controls.name.setValue(user.name);
    const key = this.avatarKeyFromUrl(user.avatarUrl);
    this.avatar.set(key);
    this.initialAvatar.set(key);
  }

  /**
   * Direkt nach einem Reload hat Firebase die Session evtl. noch nicht aus
   * IndexedDB restauriert (`currentUser` waere kurz `null`) - auf die erste
   * Auth-State-Emission warten statt sofort mit einer leeren UID zu lesen.
   * Gleiches Pattern wie shared/auth/auth.guard.ts.
   */
  private resolveUid(): Promise<string | null> {
    if (this.auth.currentUser) return Promise.resolve(this.auth.currentUser.uid);

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe();
        resolve(user?.uid ?? null);
      });
    });
  }

  private avatarKeyFromUrl(url: string): string {
    const match = /([^/]+)\.svg$/.exec(url);
    return match ? match[1] : BLANK_AVATAR;
  }

  protected avatarSrc(name: string): string {
    return `img/avatar/${name}.svg`;
  }

  protected toggleAvatarPicker(): void {
    this.avatarPickerOpen.update((open) => !open);
  }

  protected selectAvatar(name: string): void {
    this.avatar.set(name);
    this.avatarPickerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onCancel(): void {
    this.closed.emit();
  }

  protected onSubmit(): void {
    if (this.loading() || this.formInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    void this.runSave();
  }

  private async runSave(): Promise<void> {
    this.loading.set(true);
    this.formError.set(null);

    try {
      const uid = await this.resolveUid();
      if (!uid) throw new Error('not-authenticated');
      await this.userService.updateProfile(uid, this.buildChanges());
      this.showSuccess();
    } catch {
      this.formError.set('Profil konnte nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Kurze Erfolgs-Blase (wie channel-add-members), dann Dialog schliessen. */
  private showSuccess(): void {
    this.success.set(true);
    setTimeout(() => this.leaving.set(true), 1100);
    setTimeout(() => this.saved.emit(), 1300);
  }

  private buildChanges(): { name: string; avatarUrl?: string } {
    const name = this.form.getRawValue().name.trim();
    if (this.avatar() === this.initialAvatar()) return { name };
    return { name, avatarUrl: this.avatarSrc(this.avatar()) };
  }
}
