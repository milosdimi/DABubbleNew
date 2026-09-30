import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Strenger als Validators.email (das z. B. "test@test" durchlaesst):
 * Name vor dem @, Domain mit mindestens einem Punkt und eine Endung aus 2-6 Buchstaben
 * (".de", ".com", ".online"). So faellt Unsinn wie "test@test" oder
 * "test@test.commmmmmmm" schon beim Tippen auf, nicht erst beim Anlegen des Kontos.
 * Nur fuer die Registrierung - Login und Passwort-Reset pruefen bewusst lockerer.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,6}$/;

export function strictEmail(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value?.trim() ?? '';
  if (!value) return null; // "leer" meldet Validators.required
  return EMAIL_PATTERN.test(value) ? null : { email: true };
}
