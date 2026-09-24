import { Component, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { ChannelService } from '../../../shared/channel/channel.service';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { User } from '../../../shared/models';
import { Spinner } from '../../../shared/spinner/spinner';
import { UserService } from '../../../shared/user/user.service';
import { Toast } from '../../overlay/toast/toast';

type MemberMode = 'all' | 'specific';

/**
 * Wozu der Dialog geoeffnet wurde:
 * - 'new-channel': Folgeschritt nach channel-create (Sidebar), setzt die Mitgliederliste.
 * - 'existing-channel': "+" im Main-Chat-Kopf, fuegt nur neue Mitglieder hinzu.
 */
export type AddMembersPurpose = 'new-channel' | 'existing-channel';

/**
 * Fuegt dem uebergebenen Channel Mitglieder hinzu. Kein eigener Route-Pfad,
 * wird vom Parent per channelId geoeffnet (Sidebar bzw. Workspace-Shell).
 */
@Component({
  selector: 'app-channel-add-members',
  imports: [Icon, Spinner, Toast],
  templateUrl: './channel-add-members.html',
  styleUrl: './channel-add-members.scss',
})
export class ChannelAddMembers {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly channelService = inject(ChannelService);
  private readonly userService = inject(UserService);

  readonly channelId = input.required<string>();
  readonly purpose = input<AddMembersPurpose>('new-channel');

  /** Mitglieder erfolgreich gespeichert; Dialog schliessen. */
  readonly closed = output<void>();

  protected readonly users = signal<User[]>([]);
  protected readonly mode = signal<MemberMode>('all');
  protected readonly selectedUserIds = signal<ReadonlySet<string>>(new Set());
  protected readonly loading = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly leaving = signal(false);

  protected readonly formInvalid = computed(
    () =>
      (this.mode() === 'specific' && this.selectedUserIds().size === 0) ||
      // Bestehender Channel, in dem schon alle Mitglied sind: nichts hinzuzufuegen.
      (this.purpose() === 'existing-channel' && this.users().length === 0),
  );

  constructor() {
    void this.loadUsers();
  }

  /** Bei einem bestehenden Channel stehen nur User zur Auswahl, die noch kein Mitglied sind. */
  private async loadUsers(): Promise<void> {
    const users = await this.userService.listUsers();
    if (this.purpose() === 'new-channel') {
      this.users.set(users);
      return;
    }
    const channel = await this.channelService.getChannel(this.channelId());
    const members = new Set(channel?.memberIds ?? []);
    this.users.set(users.filter((user) => !members.has(user.id)));
  }

  protected selectMode(mode: MemberMode): void {
    this.mode.set(mode);
  }

  protected isSelected(userId: string): boolean {
    return this.selectedUserIds().has(userId);
  }

  protected toggleUser(userId: string): void {
    const next = new Set(this.selectedUserIds());
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    this.selectedUserIds.set(next);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    this.closed.emit();
  }

  protected onClose(): void {
    this.closed.emit();
  }

  protected onSubmit(): void {
    if (this.loading() || this.formInvalid()) return;
    void this.runSave();
  }

  private async runSave(): Promise<void> {
    this.loading.set(true);
    this.formError.set(null);

    try {
      if (this.purpose() === 'new-channel') {
        await this.channelService.setMembers(this.channelId(), this.buildMemberIds());
      } else {
        await this.channelService.addMembers(this.channelId(), this.buildMemberIds());
      }
      this.showSuccess();
    } catch {
      this.formError.set('Mitglieder konnten nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Kurze Erfolgs-Blase (wie Reset-Password), dann Dialog schliessen. */
  private showSuccess(): void {
    this.success.set(true);
    setTimeout(() => this.leaving.set(true), 1100);
    setTimeout(() => this.closed.emit(), 1300);
  }

  /** Der Channel-Ersteller ist immer dabei, egal welche Option gewaehlt wurde. */
  private buildMemberIds(): string[] {
    const currentUid = this.auth.currentUser?.uid ?? '';
    const chosen =
      this.mode() === 'all' ? this.users().map((user) => user.id) : [...this.selectedUserIds()];

    return [...new Set([currentUid, ...chosen])];
  }
}
