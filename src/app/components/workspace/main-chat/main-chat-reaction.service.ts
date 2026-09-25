import { inject, Injectable, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { MessageService } from '../../../shared/message/message';
import { Message, Reaction } from '../../../shared/models';
import { MAIN_CHAT_EMOJIS, pickerOpensBelow, QUICK_REACTIONS } from './main-chat-emojis';
import { MainChatProfileService } from './main-chat-profile.service';

/** Ein Emoji mit der Anzahl, wie oft es an einer Nachricht haengt. */
export interface ReactionGroup {
  emoji: string;
  count: number;
  /** Hat der aktuelle User selbst so reagiert? */
  mine: boolean;
}

/**
 * Reactions im Main-Chat (Channel- und Direktnachrichten).
 * Wird per `providers` in der Main-Chat-Komponente bereitgestellt.
 */
@Injectable()
export class MainChatReactionService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly messageService = inject(MessageService);
  private readonly profiles = inject(MainChatProfileService);

  readonly emojis = MAIN_CHAT_EMOJIS;
  readonly quickReactions = QUICK_REACTIONS;

  /** Nachricht, deren Emoji-Picker offen ist - hoechstens einer gleichzeitig. */
  readonly pickerMessageId = signal<string | null>(null);

  /** Oeffnet der offene Picker nach unten (statt nach oben)? */
  readonly pickerBelow = signal(false);

  togglePicker(messageId: string, button?: HTMLElement): void {
    if (button) this.pickerBelow.set(pickerOpensBelow(button));
    this.pickerMessageId.update((open) => (open === messageId ? null : messageId));
  }

  closePicker(): void {
    this.pickerMessageId.set(null);
  }

  /** Alle Gruppen, haeufigste zuerst. Laut Figma kein "+N"-Overflow: jede Emoji-Art eine Pille (umbrechend). */
  groups(message: Message): ReactionGroup[] {
    const uid = this.auth.currentUser?.uid;
    const byEmoji = new Map<string, ReactionGroup>();
    for (const reaction of message.reactions ?? []) {
      const group = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
      group.count++;
      group.mine ||= reaction.userId === uid;
      byEmoji.set(reaction.emoji, group);
    }
    return [...byEmoji.values()].sort((a, b) => b.count - a.count);
  }

  /** "Anna und Du haben mit 🚀 reagiert" (wie im Thread; "Du" immer zuletzt). */
  tooltip(message: Message, emoji: string): string {
    const uid = this.auth.currentUser?.uid;
    const reactors = (message.reactions ?? []).filter((r) => r.emoji === emoji).map((r) => r.userId);
    void this.profiles.loadProfiles(reactors);
    const others = reactors.filter((id) => id !== uid).map((id) => this.profiles.getSenderName(id) || 'Jemand');
    const names = reactors.includes(uid ?? '') ? [...others, 'Du'] : others;
    if (names.length === 0) return '';
    if (names.length === 1) {
      return names[0] === 'Du' ? `Du hast mit ${emoji} reagiert` : `${names[0]} hat mit ${emoji} reagiert`;
    }
    return `${names.slice(0, -1).join(', ')} und ${names.at(-1)} haben mit ${emoji} reagiert`;
  }

  /** Setzt oder entfernt die eigene Reaction `emoji` an `message`. */
  async toggle(message: Message, emoji: string): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) return;

    this.closePicker();
    const reaction: Reaction = { emoji, userId, messageId: message.id };
    const alreadyReacted = (message.reactions ?? []).some(
      (existing) => existing.emoji === emoji && existing.userId === userId,
    );
    if (alreadyReacted) await this.messageService.removeReaction(message, reaction);
    else await this.messageService.addReaction(message, reaction);
  }
}
