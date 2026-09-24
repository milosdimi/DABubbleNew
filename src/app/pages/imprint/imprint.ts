import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { Footer } from '../../components/workspace/footer/footer';
import { Header } from '../../components/workspace/header/header';

/** Impressum. Layout: globales Partial styles/_legal.scss. */
@Component({
  selector: 'app-imprint',
  imports: [Header, Footer, Icon],
  templateUrl: './imprint.html',
})
export class Imprint {
  private readonly location = inject(Location);

  protected back(): void {
    this.location.back();
  }
}
