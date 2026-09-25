import { Component, computed, inject, input, output } from '@angular/core';
import { MentionService, TextSegment } from '../mention/mention.service';

/** Abschnitt mit Formatierung (nur fuer normalen Text, nicht in Links/Erwaehnungen). */
interface Part extends TextSegment {
  format?: 'bold' | 'italic' | 'code';
}

/**
 * Einfache Formatierung wie in Slack: `Code`, *fett*, _kursiv_.
 * Code hat Vorrang (darin wird nichts weiter formatiert). * und _ greifen nur an
 * Wortgrenzen, damit z. B. snake_case_name oder 2*3*4 unveraendert bleiben.
 */
const FORMAT_PATTERN = /`([^`\n]+)`|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;

function withFormatting(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of text.matchAll(FORMAT_PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) parts.push({ text: match[1], format: 'code' });
    else if (match[2] !== undefined) parts.push({ text: match[2], format: 'bold' });
    else parts.push({ text: match[3], format: 'italic' });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * Nachrichtentext in Main-Chat und Thread: @-Erwaehnungen (Klick -> Profil),
 * Links (neuer Tab) und einfache Formatierung. Styles global in _mention.scss.
 */
@Component({
  selector: 'app-message-text',
  template: `@for (part of parts(); track $index) {@if (part.user; as mentioned) {<button type="button" class="mention" (click)="mentionClicked.emit(mentioned.id)">{{ part.text }}</button>} @else if (part.href) {<a class="message-link" [href]="part.href" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>} @else if (part.format === 'bold') {<strong>{{ part.text }}</strong>} @else if (part.format === 'italic') {<em>{{ part.text }}</em>} @else if (part.format === 'code') {<code class="message-code">{{ part.text }}</code>} @else {{{ part.text }}}}`,
})
export class MessageText {
  private readonly mentions = inject(MentionService);

  readonly text = input.required<string>();
  /** Klick auf eine @-Erwaehnung -> uid des Users. */
  readonly mentionClicked = output<string>();

  protected readonly parts = computed<Part[]>(() =>
    this.mentions
      .segments(this.text())
      .flatMap((segment) => (segment.user || segment.href ? [segment] : withFormatting(segment.text))),
  );
}
