/** Mobile Ansicht wie `$workspace-mobile` in _mixins.scss (bis 900px). */
export const MOBILE_QUERY = '(max-width: 900px)';

/** Sanfte Animationen nur, wenn der User Bewegung nicht reduziert haben will. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
