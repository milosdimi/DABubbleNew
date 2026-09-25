import { Component, effect, HostListener, inject, input, output, untracked } from '@angular/core';
import { Icon } from '../../../shared/icon/icon';
import { MainChatProfileService } from '../../workspace/main-chat/main-chat-profile.service';

/**
 * Mitgliederliste eines Channels (Figma "43. Members"), geoeffnet ueber die
 * Avatare im Main-Chat-Kopf. Nutzt den Profil-Cache des Main-Chats
 * (MainChatProfileService aus dessen `providers`).
 */
@Component({
  selector: 'app-channel-members',
  imports: [Icon],
  templateUrl: './channel-members.html',
  styleUrl: './channel-members.scss',
})
export class ChannelMembers {
  protected readonly profiles = inject(MainChatProfileService);

  readonly memberIds = input.required<readonly string[]>();
  readonly currentUid = input<string | null>(null);
  /** "Mitglieder hinzufuegen" nur fuer registrierte Mitglieder (wie firestore.rules). */
  readonly canAdd = input(false);

  readonly closed = output<void>();
  readonly addClicked = output<void>();
  readonly profileClicked = output<string>();

  constructor() {
    // Auch nachladen, wenn sich die Mitglieder aendern, waehrend die Liste offen ist.
    effect(() => {
      const uids = this.memberIds();
      untracked(() => void this.profiles.loadProfiles(uids));
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }
}
