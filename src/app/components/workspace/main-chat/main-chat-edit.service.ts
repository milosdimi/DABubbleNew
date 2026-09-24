import { Injectable, signal } from '@angular/core';
import { Message } from '../../../shared/models';

/**
 * "Nachricht bearbeiten" (⋮-Menue + Edit-Ansicht) in Main-Chat und Thread.
 * Wird per `providers` in der jeweiligen Komponente bereitgestellt; wohin
 * gespeichert wird (Nachricht oder Thread-Antwort), entscheidet der Aufrufer.
 */
@Injectable()
export class MainChatEditService {
  /** Nachricht, deren ⋮-Menue offen ist. */
  readonly menuMessageId = signal<string | null>(null);
  /** Nachricht, die gerade bearbeitet wird. */
  readonly editingId = signal<string | null>(null);
  readonly draft = signal('');
  readonly saving = signal(false);

  private original = '';
  private hasAttachment = false;

  toggleMenu(messageId: string): void {
    this.menuMessageId.update((open) => (open === messageId ? null : messageId));
  }

  closeMenu(): void {
    this.menuMessageId.set(null);
  }

  start(message: Message): void {
    this.closeMenu();
    this.original = message.text;
    this.hasAttachment = !!message.attachmentPath;
    this.draft.set(message.text);
    this.editingId.set(message.id);
  }

  cancel(): void {
    this.editingId.set(null);
    this.draft.set('');
  }

  isEditing(messageId: string): boolean {
    return this.editingId() === messageId;
  }

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Nur wenn sich etwas geaendert hat und die Nachricht danach nicht leer ist. */
  canSave(): boolean {
    const text = this.draft().trim();
    return !this.saving() && text !== this.original.trim() && (text.length > 0 || this.hasAttachment);
  }

  /** Enter speichert, Shift+Enter macht einen Zeilenumbruch, Escape bricht ab. */
  onKeydown(event: KeyboardEvent, persist: (text: string) => Promise<void>): void {
    if (event.key === 'Escape') {
      event.stopPropagation(); // sonst schliesst Escape im Thread das ganze Panel
      this.cancel();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.save(persist);
  }

  async save(persist: (text: string) => Promise<void>): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    try {
      await persist(this.draft().trim());
      this.cancel();
    } catch (error) {
      // Entwurf bleibt erhalten, z. B. wenn der Zugriff inzwischen entzogen wurde.
      console.warn('[edit] Nachricht konnte nicht gespeichert werden:', error);
    } finally {
      this.saving.set(false);
    }
  }
}
