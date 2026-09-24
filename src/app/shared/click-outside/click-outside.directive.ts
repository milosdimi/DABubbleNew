import { Directive, ElementRef, HostListener, inject, output } from '@angular/core';

/**
 * Meldet einen Klick ausserhalb des Host-Elements (fuer Dropdowns/Popover-
 * Menues, die per @if bedingt gerendert werden). Da das Element erst nach
 * dem oeffnenden Klick ins DOM kommt, registriert der document-Listener sich
 * immer erst NACH diesem Klick - kein Risiko, dass sich ein Menue durch
 * denselben Klick sofort wieder schliesst, der es geoeffnet hat.
 *
 * Nutzung: <div appClickOutside (appClickOutside)="close()"> ... </div>
 */
@Directive({
  selector: '[appClickOutside]',
})
export class ClickOutsideDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly appClickOutside = output<void>();

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.appClickOutside.emit();
    }
  }
}
