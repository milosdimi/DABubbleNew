import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { Toast } from '../../overlay/toast/toast';
import { Footer } from '../../workspace/footer/footer';
import { Header } from '../../workspace/header/header';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, Icon, Header, Footer, Spinner, Toast],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly authService = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly sent = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly toastVisible = signal(false);
  protected readonly toastLeaving = signal(false);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });

  private readonly status = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly formInvalid = computed(() => this.status() !== 'VALID');

  protected emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.touched || !control.errors) return null;
    if (control.errors['required']) return 'Bitte gib deine E-Mail-Adresse ein.';
    return '*Diese E-Mail-Adresse ist leider ungültig.';
  }

  protected onSubmit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    void this.send();
  }

  private async send(): Promise<void> {
    this.loading.set(true);
    this.formError.set(null);
    try {
      await this.authService.sendResetEmail(this.form.getRawValue().email);
      this.sent.set(true);
      this.playToast();
    } catch (error) {
      this.formError.set(this.authService.toMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private playToast(): void {
    this.toastVisible.set(true);
    setTimeout(() => this.toastLeaving.set(true), 1500);
    setTimeout(() => this.toastVisible.set(false), 1700);
  }
}
