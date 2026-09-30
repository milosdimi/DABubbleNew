import { Component, computed, inject, input, output } from '@angular/core';
import { ClickOutsideDirective } from '../../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../../shared/icon/icon';
import { MessageService } from '../../../../shared/message/message';
import { MessageText } from '../../../../shared/message-text/message-text';
import { Channel, Message } from '../../../../shared/models';
import { ReactionOverflowService } from '../../../../shared/reactions/reaction-overflow.service';
import { UnreadService } from '../../../../shared/unread/unread.service';
import { MainChatEditService } from '../main-chat-edit.service';
import { MainChatProfileService } from '../main-chat-profile.service';
import { MainChatReactionService } from '../main-chat-reaction.service';
import { MainChatUploadService } from '../main-chat-upload.service';

/**
 * Eine Nachricht im Main-Chat: Avatar, Name, Text/Anhang, Hover-Leiste,
 * Bearbeiten, Reactions und Thread-Hinweis. Die Services stellt der Main-Chat
 * bereit (providers), damit z. B. hoechstens ein Picker gleichzeitig offen ist.
 */
@Component({
  selector: 'app-main-chat-message',
  imports: [Icon, ClickOutsideDirective, MessageText],
  templateUrl: './main-chat-message.html',
  styleUrls: ['./main-chat-message.scss', './main-chat-message-toolbar.scss'],
})
export class MainChatMessage {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly messageService = inject(MessageService);
  protected readonly edit = inject(MainChatEditService);
  protected readonly profiles = inject(MainChatProfileService);
  protected readonly reactions = inject(MainChatReactionService);
  protected readonly uploads = inject(MainChatUploadService);
  protected readonly unread = inject(UnreadService);
  /** Figma: 7 Reaktionen sichtbar, danach "+X weitere". */
  protected readonly overflow = inject(ReactionOverflowService);

  readonly message = input.required<Message>();
  /** Kurz hervorgehoben (Sprung zu einem Suchtreffer). */
  readonly highlighted = input(false);
  /** "Im Thread antworten" oder "X Antworten" angeklickt. */
  readonly threadClicked = output<Message>();
  /** Klick auf "#Channel" im Text. */
  readonly channelClicked = output<Channel>();
  /** Klick auf "@Name" im Text (uid): oeffnet die Direktnachricht. */
  readonly mentionClicked = output<string>();

  protected readonly isOwn = computed(() => this.message().senderId === this.auth.currentUser?.uid);

  protected openAttachment(path: string): void {
    void this.uploads.openAttachment(path);
  }

  protected deleteOwn(message: Message): void {
    void this.edit.confirmDelete(() => this.messageService.deleteMessage(message));
  }

  protected saveEdit(message: Message): void {
    void this.edit.save(this.persistEdit(message));
  }

  protected onEditKeydown(event: KeyboardEvent, message: Message): void {
    this.edit.onKeydown(event, this.persistEdit(message));
  }

  protected replyLabel(count: number): string {
    return count === 1 ? '1 Antwort' : `${count} Antworten`;
  }

  private persistEdit(message: Message): (text: string) => Promise<void> {
    return (text) => this.messageService.editMessage(message, text);
  }
}
