import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Footer der Auth-Seiten mit den Links zu Impressum und Datenschutz. */
@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
})
export class Footer {}
