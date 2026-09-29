import { Component, DestroyRef, inject, signal } from '@angular/core';
import { AdminApi } from './admin-api.service';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { IconComponent } from '../core/icon.component';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="shell" [class.open]="open()">
      <aside class="side">
        <a routerLink="/admin" class="brand"><img src="img/logo.jpg" alt=""><span>Halappa<br><small>Admin</small></span></a>
        <nav>
          @for (l of links; track l.path) {
            <a [routerLink]="l.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: l.path === '/admin' }">
              <app-icon [name]="l.icon" /> {{ l.label }}
              @if (l.path === '/admin/inbox' && unread()) { <i class="badge">{{ unread() }}</i> }
            </a>
          }
        </nav>
        <div class="foot">
          <a routerLink="/" target="_blank"><app-icon name="external" /> View website</a>
          <button (click)="auth.logout()"><app-icon name="logout" /> Sign out ({{ auth.user() }})</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="burger" (click)="open.set(!open())" aria-label="Menu"><app-icon name="menu" /></button>
          <span>Halappa Foundation · Admin</span>
        </header>
        <div class="content"><router-outlet /></div>
      </div>
      <div class="scrim" (click)="open.set(false)"></div>
    </div>
  `,
  styles: [`
    .shell { display: grid; grid-template-columns: 250px 1fr; min-height: 100vh; background: #f7f1e6; }
    .side { background: var(--maroon-grad); color: #fff; display: flex; flex-direction: column; padding: 20px 14px; position: sticky; top: 0; height: 100vh; }
    .brand { display: flex; gap: 12px; align-items: center; color: #fff; text-decoration: none; font-family: var(--font-head); font-size: 1.2rem; line-height: 1.1; padding: 0 8px 20px; border-bottom: 1px solid rgba(245,210,122,.2); }
    .brand img { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--g-500); }
    .brand small { color: var(--g-400); font-family: var(--font-body); font-size: .75rem; letter-spacing: .2em; text-transform: uppercase; }
    nav { display: grid; gap: 4px; margin-top: 18px; }
    nav a { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-radius: 10px; color: rgba(255,255,255,.8); text-decoration: none; font-weight: 500; transition: all .2s; }
    nav a:hover { background: rgba(255,255,255,.08); color: #fff; }
    nav a.on { background: var(--gold-grad); color: var(--m-900); }
    .badge { margin-left: auto; font-style: normal; background: #1fb855; color: #fff; border-radius: 999px; font-size: .72rem; padding: 1px 8px; font-weight: 700; }
    .foot { margin-top: auto; display: grid; gap: 4px; }
    .foot a, .foot button { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; color: rgba(255,255,255,.7); background: none; border: 0; cursor: pointer; text-decoration: none; font-size: .88rem; text-align: left; }
    .foot a:hover, .foot button:hover { background: rgba(255,255,255,.08); color: #fff; }
    .main { min-width: 0; }
    .topbar { display: none; }
    .content { padding: 28px; max-width: 1400px; }
    .scrim { display: none; }
    @media (max-width: 900px) {
      .shell { grid-template-columns: 1fr; }
      .side { position: fixed; left: 0; top: 0; bottom: 0; width: 260px; z-index: 150; transform: translateX(-100%); transition: transform .35s var(--ease); }
      .open .side { transform: none; }
      .open .scrim { display: block; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 140; }
      .topbar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--m-800); color: var(--g-300); position: sticky; top: 0; z-index: 100; }
      .burger { background: none; border: 0; color: var(--g-300); cursor: pointer; padding: 4px; }
      .content { padding: 18px 14px; }
    }
  `],
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
