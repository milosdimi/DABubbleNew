import { Injectable } from '@angular/core';
import { Message } from '../../../shared/models';

/**
 * Datumstrenner in Nachrichtenlisten (Main-Chat und Thread).
 * Wird per `providers` in der jeweiligen Komponente bereitgestellt.
 */
@Injectable()
export class MainChatDateService {
  // TODO Figma-Wert pruefen: Format des Trenners (vorlaeufig "Heute" / "Dienstag, 14. Januar").
  private readonly dayFormat = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  /** Trenner vor der ersten Nachricht und bei jedem Tageswechsel. */
  showDateSeparator(messages: readonly Message[], index: number): boolean {
    if (index === 0) return true;
    const previous = messages[index - 1];
    const current = messages[index];
    if (!previous || !current) return false;
    return !this.isSameDay(previous.timestamp, current.timestamp);
  }

  formatDateSeparator(timestamp: number): string {
    if (this.isSameDay(timestamp, Date.now())) return 'Heute';
    return this.dayFormat.format(timestamp);
  }

  private isSameDay(a: number, b: number): boolean {
    return new Date(a).toDateString() === new Date(b).toDateString();
  }
}
