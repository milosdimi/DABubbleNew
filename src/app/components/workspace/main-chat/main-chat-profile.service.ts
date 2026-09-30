import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Unsubscribe } from 'firebase/firestore';
import { Message, OnlineStatus, User } from '../../../shared/models';
import { PresenceService } from '../../../shared/presence/presence.service';
import { UserService } from '../../../shared/user/user.service';

// Anzeige fuer Absender ohne (lesbares) Profil, z. B. Gaeste.
const UNKNOWN_SENDER_NAME = 'Gast';
const FALLBACK_AVATAR = 'img/avatar/profile_blank.svg';

/**
 * Absender-Profile und die Profil-/Channel-Info-Overlays einer Nachrichtenliste.
 * Wird per `providers` in Main-Chat bzw. Thread bereitgestellt.
 */
@Injectable()
export class MainChatProfileService {
  private readonly userService = inject(UserService);
  private readonly presence = inject(PresenceService);

  /** uid -> Profil; `null` = kein Profil vorhanden oder nicht lesbar (z. B. Gast). */
  private readonly profiles = signal<ReadonlyMap<string, User | null>>(new Map());
  private readonly pending = new Map<string, Promise<User | null>>();
  private readonly listeners: Unsubscribe[] = [];

  /** uid des Profils, das gerade als profile-card offen ist. */
  readonly selectedProfileUserId = signal<string | null>(null);

  /** ID des Channels, dessen channel-info gerade offen ist. */
  readonly selectedChannelInfoId = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.listeners.forEach((stop) => stop()));
  }

  /** Laedt die Profile aller Absender; jede uid nur einmal. */
  async loadSenderProfiles(messages: readonly Message[]): Promise<void> {
    const uids = new Set(messages.map((message) => message.senderId));
    await Promise.all([...uids].map((uid) => this.getUser(uid)));
  }

  /** Laedt mehrere Profile (z. B. Channel-Mitglieder); jede uid nur einmal. */
  async loadProfiles(uids: readonly string[]): Promise<void> {
    await Promise.all([...new Set(uids)].map((uid) => this.getUser(uid)));
  }

  /**
   * Einzelnes Profil, live beobachtet: Aendert jemand Name oder Avatar, aktualisieren
   * sich alle Nachrichten sofort. Fehlende oder gesperrte Profile ergeben `null`.
   */
  getUser(uid: string): Promise<User | null> {
    const cached = this.profiles().get(uid);
    if (cached !== undefined) return Promise.resolve(cached);

    let request = this.pending.get(uid);
    if (!request) {
      request = this.watchProfile(uid);
      this.pending.set(uid, request);
    }
    return request;
  }

  /** Startet den Listener; das Promise erfuellt sich mit dem ersten Stand. */
  private watchProfile(uid: string): Promise<User | null> {
    return new Promise((resolve) => {
      const store = (user: User | null) => {
        this.profiles.update((map) => new Map(map).set(uid, user));
        this.pending.delete(uid);
        resolve(user);
      };
      // Gaeste duerfen laut firestore.rules nur Demo-Profile lesen -> `null`.
      this.listeners.push(this.userService.watchUser(uid, store, () => store(null)));
    });
  }

  /** Bereits geladenes Profil (`undefined`, solange es noch nicht geladen ist). */
  cachedUser(uid: string): User | null | undefined {
    return this.profiles().get(uid);
  }

  /** Leer, solange das Profil noch laedt. */
  getSenderName(uid: string): string {
    const profiles = this.profiles();
    if (!profiles.has(uid)) return '';
    return profiles.get(uid)?.name ?? UNKNOWN_SENDER_NAME;
  }

  getSenderAvatar(uid: string): string {
    return this.profiles().get(uid)?.avatarUrl ?? FALLBACK_AVATAR;
  }

  /** Unbekannte oder nicht lesbare Profile (z. B. fuer Gaeste) gelten als offline. */
  getStatus(uid: string): OnlineStatus {
    const user = this.profiles().get(uid);
    return user ? this.presence.effectiveStatus(user) : 'offline';
  }

  /** Nachrichtenzeit laut Figma: "14:25 Uhr". */
  formatMessageTime(timestamp: number): string {
    const time = new Date(timestamp).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${time} Uhr`;
  }

  openProfile(uid: string): void {
    this.selectedProfileUserId.set(uid);
  }

  closeProfile(): void {
    this.selectedProfileUserId.set(null);
  }

  openChannelInfo(channelId: string): void {
    this.selectedChannelInfoId.set(channelId);
  }

  closeChannelInfo(): void {
    this.selectedChannelInfoId.set(null);
  }
}
