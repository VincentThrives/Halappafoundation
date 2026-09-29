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
  template: `
    <button type="button" (click)="toggle()" [attr.aria-label]="shown ? 'Hide password' : 'Show password'"
            [attr.aria-pressed]="shown" [title]="shown ? 'Hide password' : 'Show password'">
      <app-icon [name]="shown ? 'eye-off' : 'eye'" />
    </button>
  `,
  styles: [`
    :host { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); }
    button { width: 38px; height: 38px; border: 0; border-radius: 10px; background: transparent; cursor: pointer;
      display: grid; place-items: center; color: var(--muted); transition: background .2s, color .2s; }
    button:hover, button[aria-pressed="true"] { background: var(--cream-2); color: var(--m-700); }
    app-icon { width: 20px; height: 20px; }
  `],
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
