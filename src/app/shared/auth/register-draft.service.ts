import { Injectable } from '@angular/core';

/** Eingaben des Registrierungsformulars. */
export interface RegisterDraft {
  name: string;
  email: string;
  password: string;
  consent: boolean;
}

/**
 * Haelt den Entwurf der Registrierung, solange die App offen ist - z. B. waehrend
 * man zwischendurch die Datenschutzerklaerung liest. Bewusst nur im Arbeitsspeicher:
 * Das Passwort landet so nie im localStorage/sessionStorage.
 */
@Injectable({ providedIn: 'root' })
export class RegisterDraftService {
  private draft: RegisterDraft | null = null;

  save(draft: RegisterDraft): void {
    this.draft = draft;
  }

  /** Gemerkten Entwurf holen (`null`, wenn keiner da ist). */
  restore(): RegisterDraft | null {
    return this.draft;
  }

  clear(): void {
    this.draft = null;
  }
}
