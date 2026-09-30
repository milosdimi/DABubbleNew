import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { MAIN_CHAT_EMOJIS } from '../../components/workspace/main-chat/main-chat-emojis';
import { ClickOutsideDirective } from '../click-outside/click-outside.directive';
import { Icon } from '../icon/icon';
import { MentionService } from '../mention/mention.service';
import { TypingService } from '../typing/typing.service';

/** "@..." oder "#..." direkt vor dem Cursor (am Anfang oder nach einem Leerzeichen). */
const MENTION_BEFORE_CARET = /(^|\s)([@#])([^\s@#]*)$/;

type MentionTrigger = '@' | '#';

/** Eintrag der Vorschlagsliste: Person (mit Avatar) oder Channel. */
interface Suggestion {
  id: string;
  label: string;
  avatarUrl?: string;
}

/**
 * Smiley- und @-Button unter einem Nachrichten-Eingabefeld (Main-Chat, Thread,
 * "Neue Nachricht"). Fuegt an der Cursor-Position ein und meldet den neuen Text
 * ueber `textChange`, damit die Komponente ihren Entwurf aktualisiert.
 *
 * @-Liste: per Button oder durch Tippen von "@" (Personen) bzw. "#" (Channels); Enter/Tab uebernimmt den
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
  private readonly typing = inject(TypingService);

  readonly field = input.required<HTMLTextAreaElement>();
  readonly disabled = input(false);
  /** Chat, in dem eigenes Tippen gemeldet wird ("... schreibt gerade"); null = gar nicht. */
  readonly typingKey = input<string | null>(null);
  readonly textChange = output<string>();

  protected readonly emojis = MAIN_CHAT_EMOJIS;
  protected readonly emojiOpen = signal(false);
  /** Suchtext nach dem "@"/"#", oder null wenn die Liste zu ist. */
  protected readonly mentionQuery = signal<string | null>(null);
  /** Personen ("@") oder Channels ("#")? */
  protected readonly mentionTrigger = signal<MentionTrigger>('@');
  protected readonly suggestions = computed<Suggestion[]>(() => {
    const query = this.mentionQuery();
    if (query === null) return [];
    if (this.mentionTrigger() === '#') {
      return this.mentions.channelSuggestions(query).map(({ id, name }) => ({ id, label: name }));
    }
    return this.mentions.suggestions(query).map(({ id, name, avatarUrl }) => ({ id, label: name, avatarUrl }));
  });
  /** Mit Pfeiltasten gewaehlter Vorschlag (Enter/Tab uebernimmt ihn). */
  protected readonly activeIndex = signal(0);

  constructor() {
    void this.mentions.ensureLoaded();
    effect((onCleanup) => onCleanup(this.listenToField(this.field())));
    // Chatwechsel oder Verlassen: Tippen im vorherigen Chat beenden.
    effect((onCleanup) => {
      const key = this.typingKey();
      if (key) onCleanup(() => this.typing.stop(key));
    });
    inject(DestroyRef).onDestroy(() => this.closeAll());
  }

  /** Eingaben und Tasten des Felds beobachten; liefert die Aufraeum-Funktion. */
  private listenToField(field: HTMLTextAreaElement): () => void {
    const onInput = () => {
      this.detectMention();
      this.reportTyping(field.value);
    };
    const onKeydown = (event: KeyboardEvent) => this.onKeydown(event);
    field.addEventListener('input', onInput);
    field.addEventListener('keydown', onKeydown, true); // vor dem Enter-Senden
    return () => {
      field.removeEventListener('input', onInput);
      field.removeEventListener('keydown', onKeydown, true);
    };
  }

  private reportTyping(value: string): void {
    const key = this.typingKey();
    if (!key) return;
    if (value.trim()) this.typing.ping(key);
    else this.typing.stop(key);
  }

  protected toggleEmoji(): void {
    this.mentionQuery.set(null);
    this.emojiOpen.update((open) => !open);
  }

  protected insertEmoji(emoji: string): void {
    this.replaceBeforeCaret(0, emoji);
    this.emojiOpen.set(false);
  }

  /**
   * @-Button: "@" einfuegen (mit Leerzeichen davor, falls noetig) und Liste oeffnen.
   * Bei offener Liste schliesst er sie wieder (kein "@@@"); ein noch leeres "@" wird entfernt.
   */
  protected startMention(): void {
    this.emojiOpen.set(false);
    const query = this.mentionQuery();
    if (query !== null && this.mentionTrigger() === '@') {
      if (query === '') this.replaceBeforeCaret(1, '');
      this.mentionQuery.set(null);
      return;
    }
    const field = this.field();
    const caret = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, caret);
    this.replaceBeforeCaret(0, before && !/\s$/.test(before) ? ' @' : '@');
    this.detectMention();
  }

  protected pickMention(suggestion: Suggestion): void {
    const query = this.mentionQuery() ?? '';
    // "@"/"#" + bisher getippter Suchtext durch "@Name " bzw. "#Channel " ersetzen.
    this.replaceBeforeCaret(query.length + 1, `${this.mentionTrigger()}${suggestion.label} `);
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
    const trigger = match[2] as MentionTrigger;
    if (this.mentionQuery() === null || this.mentionTrigger() !== trigger) {
      void (trigger === '#' ? this.mentions.refreshChannels() : this.mentions.refreshUsers());
    }
    this.mentionTrigger.set(trigger);
    this.mentionQuery.set(match[3]);
    this.activeIndex.set(0);
  }

  private onKeydown(event: KeyboardEvent): void {
    this.stopTypingOnSend(event);
    if (this.mentionQuery() === null) this.closeEmojiOnEscape(event);
    else this.handleSuggestionKey(event);
  }

  /** Enter ohne Shift sendet (ausser bei offener Liste): Tippen beenden. */
  private stopTypingOnSend(event: KeyboardEvent): void {
    const key = this.typingKey();
    if (key && event.key === 'Enter' && !event.shiftKey && this.mentionQuery() === null) {
      this.typing.stop(key);
    }
  }

  private closeEmojiOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.emojiOpen()) return;
    event.stopPropagation();
    this.emojiOpen.set(false);
  }

  /** Offene @-/#-Liste: Escape schliesst, Pfeile waehlen, Enter/Tab uebernimmt. */
  private handleSuggestionKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.mentionQuery.set(null);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') return this.moveActiveSuggestion(event);
    const active = this.suggestions()[this.activeIndex()];
    if ((event.key === 'Enter' || event.key === 'Tab') && active) {
      event.preventDefault();
      event.stopImmediatePropagation(); // nicht senden
      this.pickMention(active);
    }
  }

  private moveActiveSuggestion(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (count === 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    this.activeIndex.update((index) => (index + step + count) % count);
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
