import { Injectable, signal } from '@angular/core';

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
