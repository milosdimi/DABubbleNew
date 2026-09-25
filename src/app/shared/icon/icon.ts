import { Component, input } from '@angular/core';

export type IconName =
  | 'mail'
  | 'lock'
  | 'person'
  | 'arrow-back'
  | 'send'
  | 'eye'
  | 'eye-off'
  | 'close'
  | 'hash'
  | 'radio-checked'
  | 'radio-unchecked'
  | 'edit'
  | 'message'
  | 'check'
  | 'search'
  | 'chevron-down'
  | 'plus'
  | 'attachment'
  | 'reply'
  | 'sidebar-close'
  | 'sidebar-open'
  | 'add-reaction'
  | 'comment'
  | 'more-vert'
  | 'emoji'
  | 'search'
  | 'mode-comment'
  | 'workspaces'
  | 'account-circle'
  | 'arrow-drop-down'
  | 'add'
  | 'add-circle'
  | 'person-add';

/**
 * Inline-SVG-Icons (kein Asset-Request, per `color` einfärbbar via currentColor).
 * Neues Icon: Case in icon.html ergaenzen + Name im Union-Type oben.
 */
@Component({
  selector: 'app-icon',
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class Icon {
  readonly name = input.required<IconName>();
}
