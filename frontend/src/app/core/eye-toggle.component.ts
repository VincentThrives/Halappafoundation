import { Component, Input } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Show / hide button for a password box:
 *   <div class="pw"><input #p class="input" type="password"><app-eye [for]="p" /></div>
 */
@Component({
  selector: 'app-eye',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './eye-toggle.component.html',
  styleUrl: './eye-toggle.component.scss',
})
export class EyeToggleComponent {
  @Input({ required: true }) for!: HTMLInputElement;
  shown = false;

  /** Back to dots (e.g. after the password has been saved). */
  hide() {
    this.shown = false;
    this.for.type = 'password';
  }

  toggle() {
    this.shown = !this.shown;
    this.for.type = this.shown ? 'text' : 'password';
    this.for.focus();
  }
}
