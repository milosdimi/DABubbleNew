import { Component, input } from '@angular/core';
import { Icon, IconName } from '../../../shared/icon/icon';

/** Zentrierter Bestätigungs-Toast (purple Box, optional mit Icon). */
@Component({
  selector: 'app-toast',
  imports: [Icon],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
})
export class Toast {
  readonly message = input.required<string>();
  readonly icon = input<IconName | null>(null);
}
