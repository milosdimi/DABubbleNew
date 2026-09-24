import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { User } from '../../../shared/models';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserService } from '../../../shared/user/user.service';
import { Toast } from '../../overlay/toast/toast';
import { Footer } from '../../workspace/footer/footer';
import { Header } from '../../workspace/header/header';

type RegisterStep = 'form' | 'avatar';

const AVATARS = ['avatar01', 'avatar02', 'avatar03', 'avatar04', 'avatar05', 'avatar06'];

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, Icon, Header, Footer, Spinner, Toast],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  protected readonly step = signal<RegisterStep>('form');
  protected readonly loading = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly leaving = signal(false);
  protected readonly showPassword = signal(false);

  protected readonly avatars = AVATARS;
  protected readonly selectedAvatar = signal<string | null>(null);
  protected readonly avatarError = signal<string | null>(null);

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    consent: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue],
    }),
  });

  private readonly status = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly formInvalid = computed(() => this.status() !== 'VALID');

  protected avatarSrc(name: string): string {
    return `img/avatar/${name}.svg`;
  }

  protected previewSrc(): string {
    const chosen = this.selectedAvatar();
    return chosen ? this.avatarSrc(chosen) : 'img/avatar/profile_blank.svg';
  }

  protected selectAvatar(name: string): void {
    this.selectedAvatar.set(name);
    this.avatarError.set(null);
  }

  protected goToAvatarStep(): void {
    if (this.formInvalid()) {
      this.form.markAllAsTouched();
      return;
    }
    this.formError.set(null);
    this.step.set('avatar');
  }

  protected goBack(): void {
    if (this.step() === 'avatar') {
      this.step.set('form');
      return;
    }
    void this.router.navigate(['/login']);
  }

  protected completeRegistration(): void {
    if (this.loading()) return;
    const avatar = this.selectedAvatar();
    if (!avatar) {
      this.avatarError.set('Bitte wähle einen Avatar aus.');
      return;
    }
    void this.runRegistration(avatar);
  }

  private async runRegistration(avatar: string): Promise<void> {
    const { name, email, password } = this.form.getRawValue();
    this.loading.set(true);
    this.formError.set(null);
    try {
      const uid = await this.authService.registerWithEmail(name, email, password);
      await this.userService.ensureProfile(this.buildUser(uid, name, email, avatar));
      this.showSuccess();
    } catch (error) {
      this.formError.set(this.authService.toMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private showSuccess(): void {
    this.success.set(true);
    setTimeout(() => this.leaving.set(true), 1500);
    setTimeout(() => void this.router.navigate(['/workspace']), 1700);
  }

  private buildUser(id: string, name: string, email: string, avatar: string): User {
    return {
      id,
      name,
      email,
      avatarUrl: this.avatarSrc(avatar),
      onlineStatus: 'online',
    };
  }

  protected nameError(): string | null {
    const control = this.form.controls.name;
    if (!control.touched || !control.errors) return null;
    return 'Bitte schreiben Sie einen Namen.';
  }

  protected emailError(): string | null {
    const control = this.form.controls.email;
    if (!control.touched || !control.errors) return null;
    return '*Diese E-Mail-Adresse ist leider ungültig.';
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    if (!control.touched || !control.errors) return null;
    return 'Bitte geben Sie ein Passwort ein.';
  }

  protected togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }
}
