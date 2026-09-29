import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './core/confirm.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent],
  template: `
    <div class="route-bar" [class.go]="loading()"></div>
    <router-outlet />
    <app-confirm-dialog />
  `,
  // Global: view-transition pseudo-elements live on the document root.
  encapsulation: ViewEncapsulation.None,
  styles: [`
    .route-bar {
      position: fixed; top: 0; left: 0; height: 3px; width: 0; z-index: 1000;
      background: var(--gold-grad); box-shadow: 0 0 12px rgba(245,210,122,.8);
      opacity: 0; transition: width .2s, opacity .4s .2s;
    }
    .route-bar.go { opacity: 1; width: 80%; transition: width 8s cubic-bezier(.1,.8,.2,1), opacity 0s; }

    /* ---- Page transition: old page lifts away, new page wipes up behind a gold edge ---- */
    ::view-transition-old(root) { animation: vt-out .55s cubic-bezier(.7,0,.3,1) both; }
    ::view-transition-new(root) { animation: vt-in .8s cubic-bezier(.22,.9,.24,1) both; }
    ::view-transition-group(site-header), ::view-transition-group(social-float) { animation: none; }
    @keyframes vt-out {
      to { opacity: 0; transform: translateY(-60px) scale(.97); filter: blur(4px); }
    }
    @keyframes vt-in {
      from { clip-path: inset(100% 0 0 0); transform: translateY(80px); }
      to { clip-path: inset(0 0 0 0); transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
    }
  `],
})
export class AppComponent {
  readonly loading = signal(false);

  constructor() {
    inject(Router).events.subscribe(e => {
      if (e instanceof NavigationStart) this.loading.set(true);
      if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) this.loading.set(false);
    });
  }
}
