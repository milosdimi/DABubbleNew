/**
 * Voller Reaction-Picker (Main-Chat und Thread), Raster mit 6 Spalten.
 * Die ersten vier stammen aus Figma, der Rest ist eine bewusste Erweiterung.
 */
export const MAIN_CHAT_EMOJIS: readonly string[] = [
  '🚀', '✅', '🤓', '🙌', '👍', '👎',
  '😀', '😂', '😊', '😍', '🥳', '😎',
  '🤔', '😮', '😢', '😡', '👏', '🙏',
  '💪', '👀', '🔥', '🎉', '❤️', '💯',
];

/** Schnellreaktionen direkt in der Hover-Leiste einer Nachricht. */
export const QUICK_REACTIONS: readonly string[] = ['✅', '👍'];

/**
 * Picker nach unten oeffnen, wenn der Button in der oberen Haelfte seines
 * Scrollbereichs sitzt - sonst nach oben. So wird er nie am Rand abgeschnitten.
 */
export function pickerOpensBelow(button: HTMLElement): boolean {
  const scroller = button.closest('.main-chat__scroll, .thread__scroll');
  if (!scroller) return false;
  const buttonRect = button.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return buttonRect.top - scrollerRect.top < scrollerRect.bottom - buttonRect.bottom;
}
