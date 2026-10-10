import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './core/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent],
  templateUrl: './app.component.html',
  // Global: view-transition pseudo-elements live on the document root.
  encapsulation: ViewEncapsulation.None,
  styleUrl: './app.component.scss',
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
