import { afterNextRender, effect, ElementRef, inject, Injector, Signal, untracked } from '@angular/core';
import { Message } from '../models';

/** So nah am unteren Rand gilt die Liste noch als "unten" (Pixel). */
const NEAR_BOTTOM_PX = 120;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
}

function scrollToBottom(element: HTMLElement): void {
  element.scrollTop = element.scrollHeight;
}

interface AutoScrollOptions {
  scroller: Signal<ElementRef<HTMLElement> | undefined>;
  messages: Signal<readonly Message[]>;
  /** Kennung des offenen Chats; ein Wechsel loest den Sprung nach unten aus. */
  chatKey: Signal<string | null>;
  currentUid: () => string | null | undefined;
}

/** Rueckgabe von autoScrollToLatest (z. B. holdPosition beim Sprung zu einem Suchtreffer). */
export interface AutoScroll {
  holdPosition(): void;
}

/**
 * Haelt eine Nachrichtenliste an der neuesten Nachricht (Main-Chat und Thread):
 * - Chat geoeffnet / gewechselt -> sobald die Nachrichten da sind, ganz nach unten
 * - eigene neue Nachricht -> immer nach unten
 * - fremde neue Nachricht -> nur, wenn man ohnehin unten war (wer weiter oben
 *   liest, wird nicht weggerissen)
 * - waechst der Inhalt nachtraeglich (Namen/Profile laden nach), bleibt eine
 *   Liste, die unten war, auch unten ("kleben")
 * Muss im Injection-Kontext aufgerufen werden (z. B. im Konstruktor).
 *
 * `holdPosition()` des Rueckgabewerts setzt das alles aus, bis der naechste
 * Chat geoeffnet wird oder man selbst wieder nach unten scrollt (z. B. nach
 * dem Sprung zu einem Suchtreffer).
 */
export function autoScrollToLatest(options: AutoScrollOptions): AutoScroll {
  return new AutoScroller(options, inject(Injector));
}

class AutoScroller implements AutoScroll {
  private jumpOnNextLoad = true;
  private lastSeenId: string | undefined;
  /** Ist die Liste unten? Wird bei jedem Scrollen neu bestimmt. */
  private stuckToBottom = true;

  constructor(
    private readonly options: AutoScrollOptions,
    private readonly injector: Injector,
  ) {
    effect((onCleanup) => {
      const element = options.scroller()?.nativeElement;
      if (element) onCleanup(this.stickToBottom(element));
    }, { injector });
    effect(() => this.resetForChat(options.chatKey()), { injector });
    effect(() => {
      const messages = options.messages();
      untracked(() => this.onMessages(messages));
    }, { injector });
  }

  holdPosition(): void {
    this.jumpOnNextLoad = false;
    this.stuckToBottom = false;
  }

  /** Kleben: Scrollposition merken und bei nachwachsendem Inhalt unten bleiben. */
  private stickToBottom(element: HTMLElement): () => void {
    const onScroll = () => (this.stuckToBottom = isNearBottom(element));
    const keepAtBottom = () => this.stuckToBottom && scrollToBottom(element);
    const observer = new MutationObserver(keepAtBottom);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('load', keepAtBottom, true); // nachgeladene Bilder
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('load', keepAtBottom, true);
    };
  }

  /** Neuer Chat: wieder ganz nach unten, sobald seine Nachrichten da sind. */
  private resetForChat(_chatKey: string | null): void {
    this.jumpOnNextLoad = true;
    this.lastSeenId = undefined;
    this.stuckToBottom = true;
  }

  private onMessages(messages: readonly Message[]): void {
    // Vor dem Rendern der neuen Nachrichten messen: war die Liste unten?
    const element = this.options.scroller()?.nativeElement;
    const nearBottom = !element || isNearBottom(element);
    const last = messages.at(-1);
    const isNew = !!last && last.id !== this.lastSeenId;
    const ownNew = isNew && last.senderId === this.options.currentUid();
    const jump = this.jumpOnNextLoad && messages.length > 0;

    if (jump || ownNew || (isNew && nearBottom)) this.scrollAfterRender();
    if (jump) this.jumpOnNextLoad = false;
    this.lastSeenId = last?.id;
  }

  private scrollAfterRender(): void {
    afterNextRender(
      () => {
        const element = this.options.scroller()?.nativeElement;
        if (!element) return;
        scrollToBottom(element);
        this.stuckToBottom = true;
      },
      { injector: this.injector },
    );
  }
}
