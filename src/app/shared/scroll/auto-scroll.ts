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

/**
 * Haelt eine Nachrichtenliste an der neuesten Nachricht (Main-Chat und Thread):
 * - Chat geoeffnet / gewechselt -> sobald die Nachrichten da sind, ganz nach unten
 * - eigene neue Nachricht -> immer nach unten
 * - fremde neue Nachricht -> nur, wenn man ohnehin unten war (wer weiter oben
 *   liest, wird nicht weggerissen)
 * - waechst der Inhalt nachtraeglich (Namen/Profile laden nach), bleibt eine
 *   Liste, die unten war, auch unten ("kleben")
 * Muss im Injection-Kontext aufgerufen werden (z. B. im Konstruktor).
 */
export function autoScrollToLatest(options: {
  scroller: Signal<ElementRef<HTMLElement> | undefined>;
  messages: Signal<readonly Message[]>;
  /** Kennung des offenen Chats; ein Wechsel loest den Sprung nach unten aus. */
  chatKey: Signal<string | null>;
  currentUid: () => string | null | undefined;
}): void {
  const injector = inject(Injector);
  let jumpOnNextLoad = true;
  let lastSeenId: string | undefined;
  /** Ist die Liste unten? Wird bei jedem Scrollen neu bestimmt. */
  let stuckToBottom = true;

  const scrollAfterRender = () =>
    afterNextRender(
      () => {
        const element = options.scroller()?.nativeElement;
        if (!element) return;
        scrollToBottom(element);
        stuckToBottom = true;
      },
      { injector },
    );

  // Kleben: Scrollposition merken und bei nachwachsendem Inhalt unten bleiben.
  effect((onCleanup) => {
    const element = options.scroller()?.nativeElement;
    if (!element) return;

    const onScroll = () => (stuckToBottom = isNearBottom(element));
    const keepAtBottom = () => {
      if (stuckToBottom) scrollToBottom(element);
    };
    const observer = new MutationObserver(keepAtBottom);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('load', keepAtBottom, true); // nachgeladene Bilder

    onCleanup(() => {
      observer.disconnect();
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('load', keepAtBottom, true);
    });
  });

  effect(() => {
    options.chatKey();
    jumpOnNextLoad = true;
    lastSeenId = undefined;
    stuckToBottom = true;
  });

  effect(() => {
    const messages = options.messages();
    untracked(() => {
      // Vor dem Rendern der neuen Nachrichten messen: war die Liste unten?
      const element = options.scroller()?.nativeElement;
      const nearBottom = !element || isNearBottom(element);

      const last = messages.at(-1);
      const isNew = !!last && last.id !== lastSeenId;
      const ownNew = isNew && last.senderId === options.currentUid();
      const jump = jumpOnNextLoad && messages.length > 0;

      if (jump || ownNew || (isNew && nearBottom)) scrollAfterRender();
      if (jump) jumpOnNextLoad = false;
      lastSeenId = last?.id;
    });
  });
}
