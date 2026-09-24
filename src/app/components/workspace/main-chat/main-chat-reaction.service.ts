import { inject, Injectable, signal } from '@angular/core';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { MessageService } from '../../../shared/message/message';
import { Message, Reaction } from '../../../shared/models';
import { MAIN_CHAT_EMOJIS, QUICK_REACTIONS } from './main-chat-emojis';

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

  readonly emojis = MAIN_CHAT_EMOJIS;
  readonly quickReactions = QUICK_REACTIONS;

  /** Nachricht, deren Emoji-Picker offen ist - hoechstens einer gleichzeitig. */
  readonly pickerMessageId = signal<string | null>(null);

  togglePicker(messageId: string): void {
    this.pickerMessageId.update((open) => (open === messageId ? null : messageId));
  }

  closePicker(): void {
    this.pickerMessageId.set(null);
  }

  /** Alle Gruppen, haeufigste zuerst. Laut Figma kein "+N"-Overflow: jede Emoji-Art eine Pille. */
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
