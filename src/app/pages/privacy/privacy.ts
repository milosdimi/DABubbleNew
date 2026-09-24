import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Icon } from '../../shared/icon/icon';
import { Footer } from '../../components/workspace/footer/footer';
import { Header } from '../../components/workspace/header/header';

/** Datenschutzerklaerung. Layout: globales Partial styles/_legal.scss. */
@Component({
  selector: 'app-privacy',
  imports: [Header, Footer, Icon],
  templateUrl: './privacy.html',
})
export class Privacy {
  private readonly location = inject(Location);

  protected back(): void {
    this.location.back();
  }
}
