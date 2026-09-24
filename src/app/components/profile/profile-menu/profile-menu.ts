import { Component, output } from '@angular/core';

/** Dropdown unter dem Header-Avatar. Die Aktionen selbst fuehrt der Header aus. */
@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
})
export class ProfileMenu {
  readonly profileClicked = output<void>();
  readonly logoutClicked = output<void>();
}
