import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { MAIN_CHAT_EMOJIS } from '../../components/workspace/main-chat/main-chat-emojis';
import { ClickOutsideDirective } from '../click-outside/click-outside.directive';
import { Icon } from '../icon/icon';
import { MentionService } from '../mention/mention.service';
import { User } from '../models';

/** "@..." direkt vor dem Cursor (am Anfang oder nach einem Leerzeichen). */
const MENTION_BEFORE_CARET = /(^|\s)@([^\s@]*)$/;

/**
 * Smiley- und @-Button unter einem Nachrichten-Eingabefeld (Main-Chat, Thread,
 * "Neue Nachricht"). Fuegt an der Cursor-Position ein und meldet den neuen Text
 * ueber `textChange`, damit die Komponente ihren Entwurf aktualisiert.
 *
 * @-Liste: per Button oder durch Tippen von "@"; Enter/Tab uebernimmt den
 * ersten Treffer, Escape schliesst. Diese Tasten werden vor dem Senden-per-Enter
 * der Komponente abgefangen (Capture-Listener am Feld).
 */
@Component({
  selector: 'app-chat-input-tools',
  imports: [Icon, ClickOutsideDirective],
  templateUrl: './chat-input-tools.html',
  styleUrl: './chat-input-tools.scss',
})
export class ChatInputTools {
  private readonly mentions = inject(MentionService);

  readonly field = input.required<HTMLTextAreaElement>();
  readonly disabled = input(false);
  readonly textChange = output<string>();

  protected readonly emojis = MAIN_CHAT_EMOJIS;
  protected readonly emojiOpen = signal(false);
  /** Suchtext nach dem "@", oder null wenn die Liste zu ist. */
  protected readonly mentionQuery = signal<string | null>(null);
  protected readonly suggestions = signal<User[]>([]);

  constructor() {
    void this.mentions.ensureLoaded();
    const destroyRef = inject(DestroyRef);

    effect((onCleanup) => {
      const field = this.field();
      const onInput = () => this.detectMention();
      const onKeydown = (event: KeyboardEvent) => this.onKeydown(event);
      field.addEventListener('input', onInput);
      field.addEventListener('keydown', onKeydown, true); // vor dem Enter-Senden
      onCleanup(() => {
        field.removeEventListener('input', onInput);
        field.removeEventListener('keydown', onKeydown, true);
      });
    });
    destroyRef.onDestroy(() => this.closeAll());
  }

  protected toggleEmoji(): void {
    this.mentionQuery.set(null);
    this.emojiOpen.update((open) => !open);
  }

  protected insertEmoji(emoji: string): void {
    this.replaceBeforeCaret(0, emoji);
    this.emojiOpen.set(false);
  }

  /** @-Button: "@" einfuegen (mit Leerzeichen davor, falls noetig) und Liste oeffnen. */
  protected startMention(): void {
    this.emojiOpen.set(false);
    const field = this.field();
    const caret = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, caret);
    this.replaceBeforeCaret(0, before && !/\s$/.test(before) ? ' @' : '@');
    this.detectMention();
  }

  protected pickMention(user: User): void {
    const query = this.mentionQuery() ?? '';
    // "@" + bisher getippter Suchtext durch "@Name " ersetzen.
    this.replaceBeforeCaret(query.length + 1, `@${user.name} `);
    this.mentionQuery.set(null);
  }

  protected closeAll(): void {
    this.emojiOpen.set(false);
    this.mentionQuery.set(null);
  }

  private detectMention(): void {
    const field = this.field();
    const caret = field.selectionStart ?? field.value.length;
    const match = MENTION_BEFORE_CARET.exec(field.value.slice(0, caret));
    if (!match) {
      this.mentionQuery.set(null);
      return;
    }
    this.mentionQuery.set(match[2]);
    this.suggestions.set(this.mentions.suggestions(match[2]));
  }

  private onKeydown(event: KeyboardEvent): void {
    if (this.mentionQuery() === null) {
      if (event.key === 'Escape' && this.emojiOpen()) {
        event.stopPropagation();
        this.emojiOpen.set(false);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.mentionQuery.set(null);
      return;
    }
    const first = this.suggestions()[0];
    if ((event.key === 'Enter' || event.key === 'Tab') && first) {
      event.preventDefault();
      event.stopImmediatePropagation(); // nicht senden
      this.pickMention(first);
    }
  }

  /** Ersetzt `removeCount` Zeichen vor dem Cursor durch `insert` und setzt den Cursor dahinter. */
  private replaceBeforeCaret(removeCount: number, insert: string): void {
    const field = this.field();
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const from = Math.max(0, start - removeCount);
    const next = field.value.slice(0, from) + insert + field.value.slice(end);
    const caret = from + insert.length;

    field.value = next;
    field.focus();
    field.setSelectionRange(caret, caret);
    this.textChange.emit(next);
  }
}
