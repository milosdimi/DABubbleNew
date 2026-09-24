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
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { ChannelService } from '../../../shared/channel/channel.service';
import { Spinner } from '../../../shared/spinner/spinner';

function notBlank(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length === 0 ? { blank: true } : null;
}

/**
 * Modal-Dialog "Channel erstellen". Kein eigener Route-Pfad – wird von der
 * Sidebar per @if eingeblendet. Meldet sich nur ueber
 * Outputs zurueck, damit der Parent das Schliessen/Navigieren uebernimmt.
 */
@Component({
  selector: 'app-channel-create',
  imports: [ReactiveFormsModule, Icon, Spinner],
  templateUrl: './channel-create.html',
  styleUrl: './channel-create.scss',
})
export class ChannelCreate {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);

  /** Dialog wurde geschlossen (X, Escape, Backdrop-Klick) ohne zu erstellen. */
  readonly closed = output<void>();
  /** Channel wurde erfolgreich erstellt; traegt die neue Channel-ID. */
  readonly created = output<string>();

  protected readonly loading = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank],
    }),
    description: new FormControl('', { nonNullable: true }),
  });

  private readonly status = toSignal(this.form.controls.name.statusChanges, {
    initialValue: this.form.controls.name.status,
  });
  protected readonly formInvalid = computed(() => this.status() !== 'VALID');

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  protected onSubmit(): void {
    if (this.loading() || this.formInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    void this.runCreate();
  }

  private async runCreate(): Promise<void> {
    this.loading.set(true);
    this.formError.set(null);

    try {
      const { name, description } = this.form.getRawValue();
      const uid = this.auth.currentUser?.uid ?? '';
      const id = await this.channelService.createChannel(name.trim(), description.trim(), uid);
      this.created.emit(id);
    } catch {
      this.formError.set('Channel konnte nicht erstellt werden. Bitte versuche es erneut.');
    } finally {
      this.loading.set(false);
    }
  }
}
