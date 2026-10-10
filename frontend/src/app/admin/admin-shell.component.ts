import { Component, DestroyRef, inject, signal } from '@angular/core';
import { AdminApi } from './admin-api.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { IconComponent } from '../core/icon.component';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
})
export class AdminShellComponent {
  readonly auth = inject(AuthService);
  readonly open = signal(false);
  readonly links = [
    { path: '/admin', icon: 'dashboard', label: 'Dashboard' },
    { path: '/admin/enquiries', icon: 'article', label: 'Enquiries' },
    { path: '/admin/inbox', icon: 'inbox', label: 'Inbox' },
    { path: '/admin/messages', icon: 'send', label: 'Bulk messages' },
    { path: '/admin/vouchers', icon: 'check', label: 'Voucher check-in' },
    { path: '/admin/posts', icon: 'article', label: 'Press & Views' },
    { path: '/admin/gallery', icon: 'image', label: 'Gallery' },
    { path: '/admin/timeline', icon: 'history', label: 'Timeline' },
    { path: '/admin/settings', icon: 'settings', label: 'Settings' },
  ];

  readonly unread = signal(0);
  private api = inject(AdminApi);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    inject(Router).events.subscribe(e => {
      if (e instanceof NavigationEnd) { this.open.set(false); this.checkUnread(); }
    });
    this.checkUnread();
    this.timer = setInterval(() => this.checkUnread(), 30000);
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  private checkUnread() { this.api.unread().subscribe({ next: r => this.unread.set(r.unread), error: () => {} }); }
}
