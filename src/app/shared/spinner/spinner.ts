import { Component } from '@angular/core';

/** Rotierender Lade-Spinner. Farbe wird vom Elternelement geerbt (currentColor). */
@Component({
  selector: 'app-spinner',
  template: '<span class="spinner" role="status" aria-label="Lädt …"></span>',
  styleUrl: './spinner.scss',
})
export class Spinner {}
