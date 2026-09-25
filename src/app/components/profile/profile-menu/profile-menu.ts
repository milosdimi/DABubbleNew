import { Component, input, output } from '@angular/core';
import { OnlineStatus } from '../../../shared/models';
import { STATUS_OPTIONS } from '../../../shared/status/status';

/** Dropdown unter dem Header-Avatar. Die Aktionen selbst fuehrt der Header aus. */
@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
})
export class ProfileMenu {
  /** Aktuell selbst gewaehlter Status (wird markiert). */
  readonly status = input<OnlineStatus>('online');
  readonly canChangeStatus = input(false);

  readonly profileClicked = output<void>();
  readonly logoutClicked = output<void>();
  readonly statusSelected = output<OnlineStatus>();

  protected readonly options = STATUS_OPTIONS;
}
