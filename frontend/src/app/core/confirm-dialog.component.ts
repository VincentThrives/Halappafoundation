import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { IconComponent } from './icon.component';
import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent implements AfterViewChecked {
  readonly confirm = inject(ConfirmService);
  @ViewChild('ok') ok?: ElementRef<HTMLButtonElement>;
  private focused: unknown = null;

  /** Focus the main button when a popup opens, so Enter confirms. */
  ngAfterViewChecked() {
    const c = this.confirm.current();
    if (c && c !== this.focused && this.ok) { this.focused = c; this.ok.nativeElement.focus(); }
    if (!c) this.focused = null;
  }

  @HostListener('document:keydown.escape')
  esc() { if (this.confirm.current()) this.confirm.close(false); }
}
