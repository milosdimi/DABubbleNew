import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TypingService } from './typing.service';

/** Zeile "Anna schreibt gerade ..." ueber dem Eingabefeld (Main-Chat und Thread). */
@Component({
  selector: 'app-typing-indicator',
  template: `<p class="typing" aria-live="polite">{{ text() }}</p>`,
  styleUrl: './typing-indicator.scss',
})
export class TypingIndicator {
  private readonly typing = inject(TypingService);

  /** Chat, dessen Tippende angezeigt werden (null = keiner). */
  readonly chatKey = input<string | null>(null);

  private readonly names = signal<string[]>([]);

  protected readonly text = computed(() => {
    const names = this.names();
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} schreibt gerade …`;
    if (names.length === 2) return `${names[0]} und ${names[1]} schreiben gerade …`;
    return 'Mehrere Personen schreiben gerade …';
  });

  constructor() {
    effect((onCleanup) => {
      const key = this.chatKey();
      this.names.set([]);
      if (!key) return;
      onCleanup(this.typing.watch(key, (names) => this.names.set(names)));
    });
  }
}
