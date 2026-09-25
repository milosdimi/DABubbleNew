import { OnlineStatus } from '../models';

/**
 * Selbst waehlbarer Status (eigene Idee, nicht in Figma). Farben der Punkte:
 * mixin `mx.status-dot` in _mixins.scss (Aktiv = Figma "online green").
 */
export const STATUS_OPTIONS: readonly { value: OnlineStatus; label: string }[] = [
  { value: 'online', label: 'Aktiv' },
  { value: 'away', label: 'Abwesend' },
  { value: 'busy', label: 'Nicht stören' },
  { value: 'offline', label: 'Offline' },
];

export const STATUS_LABELS: Record<OnlineStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<OnlineStatus, string>;
