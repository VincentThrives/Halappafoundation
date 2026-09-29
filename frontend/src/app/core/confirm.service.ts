import { AfterViewChecked, Component, ElementRef, HostListener, Injectable, ViewChild, inject, signal } from '@angular/core';
import { IconComponent } from './icon.component';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Highlighted line, e.g. the name of the item being deleted. */
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  /** Red button + trash icon for destructive actions. */
  danger?: boolean;
  icon?: string;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void; }

/**
 * In-page confirmation popup. Used instead of window.confirm(), which some browsers
 * (embedded/in-app browsers, some mobile ones) block, silently answering "no".
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<Pending | null>(null);

  ask(opts: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false); // only one popup at a time
    return new Promise(resolve => this.current.set({ ...opts, resolve }));
  }

  close(ok: boolean) {
    const c = this.current();
    this.current.set(null);
    c?.resolve(ok);
  }
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (confirm.current(); as c) {
      <div class="bg" (click)="confirm.close(false)">
        <div class="box" [class.danger]="c.danger" role="alertdialog" aria-modal="true"
             [attr.aria-label]="c.title" (click)="$event.stopPropagation()">
          <div class="ic"><app-icon [name]="c.icon || (c.danger ? 'trash' : 'check')" /></div>
          <h2>{{ c.title }}</h2>
          @if (c.detail) { <p class="detail">{{ c.detail }}</p> }
          @if (c.message) { <p class="msg">{{ c.message }}</p> }
          <div class="btns">
            <button class="cancel" (click)="confirm.close(false)">{{ c.cancelText || 'Cancel' }}</button>
            <button #ok class="ok" (click)="confirm.close(true)">{{ c.confirmText || (c.danger ? 'Delete' : 'Yes') }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .bg { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px;
      background: rgba(36, 2, 5, .55); backdrop-filter: blur(3px); animation: fade .2s ease both; }
    .box { width: min(420px, 100%); background: #fff; border-radius: 20px; padding: 28px 26px 22px; text-align: center;
      box-shadow: 0 30px 80px -20px rgba(0,0,0,.6); border-top: 5px solid var(--g-500); animation: pop .3s cubic-bezier(.22,.9,.24,1) both; }
    .box.danger { border-top-color: #c62828; }
    .ic { width: 64px; height: 64px; margin: -60px auto 12px; border-radius: 50%; display: grid; place-items: center;
      background: var(--gold-grad); color: var(--m-800); box-shadow: 0 10px 24px -8px rgba(0,0,0,.4); border: 4px solid #fff; }
    .danger .ic { background: linear-gradient(135deg, #ef5350, #b71c1c); color: #fff; }
    .ic app-icon { width: 28px; height: 28px; }
    h2 { margin: 0 0 8px; font-size: 1.3rem; color: var(--m-800); }
    .detail { margin: 0 0 8px; font-weight: 600; color: var(--ink); background: var(--cream-2); border-radius: 10px; padding: 8px 12px; word-break: break-word; }
    .msg { margin: 0 0 4px; color: var(--muted); font-size: .92rem; }
    .btns { display: flex; gap: 10px; margin-top: 20px; }
    .btns button { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: .95rem; transition: all .2s; }
    .cancel { background: #fff; border: 1.5px solid var(--line); color: var(--m-800); }
    .cancel:hover { background: var(--cream); }
    .ok { border: 0; background: var(--maroon-grad); color: var(--g-300); }
    .danger .ok { background: linear-gradient(135deg, #e53935, #b71c1c); color: #fff; }
    .ok:hover { filter: brightness(1.1); transform: translateY(-1px); }
    @keyframes fade { from { opacity: 0; } }
    @keyframes pop { from { opacity: 0; transform: translateY(20px) scale(.95); } }
  `],
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
