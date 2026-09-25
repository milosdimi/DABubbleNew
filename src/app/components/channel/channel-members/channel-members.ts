import { Component, computed, effect, HostListener, inject, input, output, signal, untracked } from '@angular/core';
import { ChannelService } from '../../../shared/channel/channel.service';
import { Icon } from '../../../shared/icon/icon';
import { Toast } from '../../overlay/toast/toast';
import { MainChatProfileService } from '../../workspace/main-chat/main-chat-profile.service';

/**
 * Mitgliederliste eines Channels (Figma "43. Members"), geoeffnet ueber die
 * Avatare im Main-Chat-Kopf. Nutzt den Profil-Cache des Main-Chats
 * (MainChatProfileService aus dessen `providers`).
 *
 * Der Ersteller kann andere Mitglieder entfernen (x + Rueckfrage, eigene
 * Erweiterung) - so erlauben es auch die firestore.rules.
 */
@Component({
  selector: 'app-channel-members',
  imports: [Icon, Toast],
  templateUrl: './channel-members.html',
  styleUrl: './channel-members.scss',
})
export class ChannelMembers {
  protected readonly profiles = inject(MainChatProfileService);
  private readonly channelService = inject(ChannelService);

  readonly channelId = input.required<string>();
  readonly channelName = input('');
  readonly creatorId = input<string | null>(null);
  readonly memberIds = input.required<readonly string[]>();
  readonly currentUid = input<string | null>(null);
  /** "Mitglieder hinzufuegen" nur fuer registrierte Mitglieder (wie firestore.rules). */
  readonly canAdd = input(false);

  readonly closed = output<void>();
  readonly addClicked = output<void>();
  readonly profileClicked = output<string>();

  /** Nur der Ersteller entfernt andere (firestore.rules: isAllowedMemberChange). */
  protected readonly canRemove = computed(
    () => !!this.currentUid() && this.currentUid() === this.creatorId(),
  );
  /** Mitglied, fuer das gerade die Rueckfrage "wirklich entfernen?" offen ist. */
  protected readonly confirmUid = signal<string | null>(null);
  protected readonly removing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);

  constructor() {
    // Auch nachladen, wenn sich die Mitglieder aendern, waehrend die Liste offen ist.
    effect(() => {
      const uids = this.memberIds();
      untracked(() => void this.profiles.loadProfiles(uids));
    });
  }

  protected askRemove(uid: string): void {
    this.error.set(null);
    this.confirmUid.set(uid);
  }

  protected cancelRemove(): void {
    this.confirmUid.set(null);
  }

  protected async confirmRemove(): Promise<void> {
    const uid = this.confirmUid();
    if (!uid || this.removing()) return;
    const name = this.profiles.getSenderName(uid);

    this.removing.set(true);
    try {
      await this.channelService.removeMember(this.channelId(), uid);
      this.confirmUid.set(null);
      this.showToast(`${name} wurde entfernt`);
    } catch {
      this.error.set(`${name} konnte nicht entfernt werden. Bitte versuche es erneut.`);
    } finally {
      this.removing.set(false);
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 1400);
  }

  /** Escape schliesst zuerst die Rueckfrage, sonst die Liste. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.confirmUid()) this.cancelRemove();
    else this.closed.emit();
  }
}
