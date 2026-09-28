import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ClickOutsideDirective } from '../../../shared/click-outside/click-outside.directive';
import { FIREBASE_AUTH } from '../../../shared/firebase/firebase.tokens';
import { Icon } from '../../../shared/icon/icon';
import { Channel, User } from '../../../shared/models';
import {
  EMPTY_RESULTS,
  MessageHit,
  SearchPlace,
  SearchService,
} from '../../../shared/search/search.service';

/**
 * Suche ueber Channels, Personen und Nachrichten mit Trefferliste.
 * Desktop im Header ("Devspace durchsuchen", Strg+K), mobil im Menue ("Gehe zu...",
 * Klasse `search--menu`).
 */
@Component({
  selector: 'app-search-bar',
  imports: [Icon, ClickOutsideDirective],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
})
export class SearchBar {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly searchService = inject(SearchService);

  readonly placeholder = input('Devspace durchsuchen');
  /** Strg+K fokussiert diese Suche (nur eine Instanz sollte das tun). */
  readonly shortcut = input(false);

  /** Treffer angeklickt -> Workspace oeffnet Channel bzw. Direktchat. */
  readonly channelSelected = output<Channel>();
  readonly userSelected = output<User>();
  /** Nachrichten-Treffer: Workspace oeffnet den Chat und springt zur Nachricht. */
  readonly messageSelected = output<MessageHit>();

  /** Fuer "(Du)" hinter dem eigenen Namen. */
  protected uid(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Strg+K (Mac: Cmd+K) springt in die Suche - nur bei der Suche mit `shortcut`. */
  @HostListener('document:keydown', ['$event'])
  protected onShortcut(event: KeyboardEvent): void {
    if (!this.shortcut()) return;
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    const input = this.searchInput()?.nativeElement;
    if (!input) return;
    event.preventDefault();
    input.focus();
    input.select();
  }

  protected readonly searchTerm = signal('');
  protected readonly searchOpen = signal(false);
  protected readonly searchLoading = signal(false);
  private readonly searchIndex = signal<Awaited<ReturnType<SearchService['loadIndex']>> | null>(null);

  protected readonly results = computed(() => {
    const index = this.searchIndex();
    return index ? this.searchService.search(index, this.searchTerm()) : EMPTY_RESULTS;
  });

  protected readonly searchable = computed(() => this.searchService.isSearchable(this.searchTerm()));

  protected readonly hasResults = computed(() => {
    const { channels, users, messages } = this.results();
    return channels.length + users.length + messages.length > 0;
  });

  /** Beim Oeffnen der Suche den Index frisch laden (neue Nachrichten, Channels). */
  protected async openSearch(): Promise<void> {
    if (this.searchOpen()) return;
    this.searchOpen.set(true);
    this.searchLoading.set(true);
    try {
      this.searchIndex.set(await this.searchService.loadIndex());
    } catch (error) {
      console.warn('[search] Index konnte nicht geladen werden:', error);
      this.searchIndex.set(null);
    } finally {
      this.searchLoading.set(false);
    }
  }

  protected closeSearch(): void {
    this.searchOpen.set(false);
  }

  protected onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    void this.openSearch();
  }

  protected pickChannel(channel: Channel): void {
    this.finishSearch();
    this.channelSelected.emit(channel);
  }

  protected pickUser(user: User): void {
    this.finishSearch();
    this.userSelected.emit(user);
  }

  protected pickMessage(hit: MessageHit): void {
    this.finishSearch();
    this.messageSelected.emit(hit);
  }

  protected placeLabel(place: SearchPlace): string {
    return place.kind === 'channel' ? `# ${place.channel.name}` : `Direktnachricht mit ${place.partner.name}`;
  }

  private finishSearch(): void {
    this.searchTerm.set('');
    this.searchOpen.set(false);
    this.searchIndex.set(null);
  }
}
