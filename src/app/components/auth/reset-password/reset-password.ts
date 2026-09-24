import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth/auth.service';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { Toast } from '../../overlay/toast/toast';
import { Footer } from '../../workspace/footer/footer';
import { Header } from '../../workspace/header/header';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return password && confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, Icon, Header, Footer, Spinner, Toast],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly oobCode = inject(ActivatedRoute).snapshot.queryParamMap.get('oobCode');

  protected readonly hasCode = this.oobCode !== null;
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly leaving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly showConfirm = signal(false);

  protected readonly form = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      confirm: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  private readonly status = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  protected readonly formInvalid = computed(() => this.status() !== 'VALID');

  protected mismatchError(): string | null {
    if (!this.form.controls.confirm.touched || !this.form.errors?.['mismatch']) {
      return null;
    }
    return 'Ihre Kennwörter stimmen nicht überein';
  }

  protected onSubmit(): void {
    if (this.loading() || this.formInvalid() || this.oobCode === null) {
      this.form.markAllAsTouched();
      return;
    }
    void this.runReset(this.oobCode);
  }

  private async runReset(code: string): Promise<void> {
    this.loading.set(true);
    this.formError.set(null);
    try {
      await this.authService.confirmReset(code, this.form.getRawValue().password);
      this.showSuccess();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Fehler beim Zurücksetzen.');
    } finally {
      this.loading.set(false);
    }
  }

  private showSuccess(): void {
    this.success.set(true);
    setTimeout(() => this.leaving.set(true), 1100);
    setTimeout(() => void this.router.navigate(['/login']), 1300);
  }

  protected togglePasswordVisibility(field: 'password' | 'confirm'): void {
    const target = field === 'password' ? this.showPassword : this.showConfirm;
    target.update((visible) => !visible);
  }
}
