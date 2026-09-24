import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { onAuthStateChanged } from 'firebase/auth';
import { ChannelService } from '../../../shared/channel/channel.service';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { Channel, User } from '../../../shared/models';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserService } from '../../../shared/user/user.service';
import { Toast } from '../../overlay/toast/toast';

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length === 0 ? { blank: true } : null;
}

// TODO: Text im Figma Content-Feld verifizieren (vermutlich "Channel verlassen").
// An dieser einen Stelle austauschen, falls der echte Text abweicht.
const LEAVE_BUTTON_LABEL = 'Channel verlassen';

/**
 * Channel-Verwaltungs-Dialog: read-only Channel-Infos + zwei inline
 * editierbare Felder (Name, Beschreibung), Edit-Links nur fuer den
 * Channel-Ersteller sichtbar. Kein eigener Route-Pfad, gleiches
 * Output-Pattern wie channel-create/profile-edit.
 */
@Component({
  selector: 'app-channel-info',
  imports: [ReactiveFormsModule, Icon, Spinner, Toast],
  templateUrl: './channel-info.html',
  styleUrl: './channel-info.scss',
})
export class ChannelInfo {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly userService = inject(UserService);

  readonly channelId = input.required<string>();

  /** Dialog wurde geschlossen (X, Escape, Backdrop, Channel verlassen). */
  readonly closed = output<void>();

  /** Nach "Channel verlassen" kann der Parent den Dialog schon selbst geschlossen haben. */
  private destroyed = false;
  private readonly markDestroyed = inject(DestroyRef).onDestroy(() => (this.destroyed = true));

  protected readonly leaveLabel = LEAVE_BUTTON_LABEL;

  protected readonly channel = signal<Channel | null>(null);
  protected readonly creator = signal<User | null>(null);
  private readonly currentUid = signal<string | null>(null);

  protected readonly isCreator = computed(() => {
    const uid = this.currentUid();
    const ch = this.channel();
    return uid !== null && ch !== null && uid === ch.createdBy;
  });

  protected readonly editingName = signal(false);
  protected readonly savingName = signal(false);
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, notBlank],
  });
  private readonly nameStatus = toSignal(this.nameControl.statusChanges, {
    initialValue: this.nameControl.status,
  });
  protected readonly nameSaveError = signal<string | null>(null);

  protected readonly editingDescription = signal(false);
  protected readonly savingDescription = signal(false);
  protected readonly descriptionControl = new FormControl('', { nonNullable: true });
  protected readonly descriptionSaveError = signal<string | null>(null);

  protected readonly success = signal(false);
  protected readonly leavingToast = signal(false);

  protected readonly leaving = signal(false);

  constructor() {
    this.resolveCurrentUid();
    effect(() => void this.loadChannel(this.channelId()));
  }

  private async loadChannel(channelId: string): Promise<void> {
    const channel = await this.channelService.getChannel(channelId);
    this.channel.set(channel);
    if (channel) void this.loadCreator(channel.createdBy);
  }

  private async loadCreator(uid: string): Promise<void> {
    this.creator.set(await this.userService.getUser(uid));
  }

  /**
   * Direkt nach einem Reload hat Firebase die Session evtl. noch nicht aus
   * IndexedDB restauriert - auf die erste Auth-State-Emission warten statt
   * sofort mit `null` zu vergleichen. Gleiches Pattern wie profile-card.
   */
  private resolveCurrentUid(): void {
    if (this.auth.currentUser) {
      this.currentUid.set(this.auth.currentUser.uid);
      return;
    }
    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      unsubscribe();
      this.currentUid.set(user?.uid ?? null);
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.editingName() || this.editingDescription()) return;
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  protected nameFieldError(): string | null {
    if (this.nameControl.touched && this.nameStatus() !== 'VALID') {
      return 'Name darf nicht leer sein.';
    }
    return this.nameSaveError();
  }

  protected startEditName(): void {
    this.nameControl.setValue(this.channel()?.name ?? '');
    this.nameControl.markAsUntouched();
    this.nameSaveError.set(null);
    this.editingName.set(true);
  }

  protected cancelEditName(event: Event): void {
    event.stopPropagation();
    this.editingName.set(false);
  }

  protected saveName(): void {
    if (this.nameStatus() !== 'VALID') {
      this.nameControl.markAsTouched();
      return;
    }
    void this.runSaveName();
  }

  private async runSaveName(): Promise<void> {
    this.savingName.set(true);
    const name = this.nameControl.getRawValue().trim();
    try {
      await this.channelService.updateChannel(this.channelId(), { name });
      this.channel.update((ch) => (ch ? { ...ch, name } : ch));
      this.editingName.set(false);
      this.showSuccess();
    } catch {
      this.nameSaveError.set('Name konnte nicht gespeichert werden.');
    } finally {
      this.savingName.set(false);
    }
  }

  protected startEditDescription(): void {
    this.descriptionControl.setValue(this.channel()?.description ?? '');
    this.descriptionSaveError.set(null);
    this.editingDescription.set(true);
  }

  protected cancelEditDescription(event: Event): void {
    event.stopPropagation();
    this.editingDescription.set(false);
  }

  protected saveDescription(): void {
    void this.runSaveDescription();
  }

  private async runSaveDescription(): Promise<void> {
    this.savingDescription.set(true);
    const description = this.descriptionControl.getRawValue().trim();
    try {
      await this.channelService.updateChannel(this.channelId(), { description });
      this.channel.update((ch) => (ch ? { ...ch, description } : ch));
      this.editingDescription.set(false);
      this.showSuccess();
    } catch {
      this.descriptionSaveError.set('Beschreibung konnte nicht gespeichert werden.');
    } finally {
      this.savingDescription.set(false);
    }
  }

  /** Kurze Erfolgs-Blase (wie channel-add-members), bleibt aber im Dialog. */
  private showSuccess(): void {
    this.success.set(true);
    this.leavingToast.set(false);
    setTimeout(() => this.leavingToast.set(true), 1100);
    setTimeout(() => this.success.set(false), 1300);
  }

  protected onLeaveClick(): void {
    if (this.leaving()) return;
    void this.runLeave();
  }

  private async runLeave(): Promise<void> {
    const uid = this.currentUid();
    if (!uid) return;

    this.leaving.set(true);
    try {
      await this.channelService.leaveChannel(this.channelId(), uid);
      if (!this.destroyed) this.closed.emit();
    } finally {
      this.leaving.set(false);
    }
  }
}
