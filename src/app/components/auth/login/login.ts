import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { Footer } from '../../workspace/footer/footer';
import { Header } from '../../workspace/header/header';

type LoginAction = 'email' | 'google' | 'guest';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, Icon, Header, Footer, Spinner],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly pending = signal<LoginAction | null>(null);
  protected readonly formError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected onSubmit(): void {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    void this.run('email', () => this.authService.loginWithEmail(email, password));
  }

  protected onGoogleLogin(): void {
    if (this.loading()) return;
    void this.run('google', () => this.authService.loginWithGoogle());
  }

  protected onGuestLogin(): void {
    if (this.loading()) return;
    void this.run('guest', () => this.authService.loginAsGuest());
  }

  private async run(action: LoginAction, task: () => Promise<void>): Promise<void> {
    this.setBusy(action);
    try {
      await task();
      await this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      this.formError.set(this.authService.toMessage(error));
    } finally {
      this.setBusy(null);
    }
  }

  private returnUrl(): string {
    return this.route.snapshot.queryParamMap.get('returnUrl') ?? '/workspace';
  }

  private setBusy(action: LoginAction | null): void {
    this.loading.set(action !== null);
    this.pending.set(action);
    if (action) this.formError.set(null);
  }

  protected emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.touched || !control.errors) return null;
    if (control.errors['required']) return 'E-Mail ist erforderlich.';
    return 'Diese E-Mail-Adresse ist leider ungültig.';
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    if (!control.touched || !control.errors) return null;
    return 'Passwort ist erforderlich.';
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }
}
