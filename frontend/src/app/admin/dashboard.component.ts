import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head"><div><h1>Dashboard</h1><p>Overview of enquiries and site content.</p></div></div>
    <div class="quick">
      <a routerLink="/admin/enquiries" class="qa"><app-icon name="inbox" /><b>View &amp; search queries</b><span>All Contact Us requests</span></a>
      <a routerLink="/admin/enquiries" [queryParams]="{ panel: 'download' }" class="qa"><app-icon name="download" /><b>Download Excel</b><span>By date range or all</span></a>
      <a routerLink="/admin/messages/new" class="qa wa"><app-icon name="whatsapp" /><b>Send bulk message</b><span>WhatsApp · Email · SMS, Excel import</span></a>
      <a routerLink="/admin/inbox" class="qa"><app-icon name="inbox" /><b>Inbox</b><span>Received &amp; sent messages</span></a>
      <a routerLink="/admin/vouchers" class="qa"><app-icon name="check" /><b>Voucher check-in</b><span>At the event entrance</span></a>
    </div>
    @if (d(); as d) {
      <div class="tiles">
        <a routerLink="/admin/enquiries" class="tile hi"><app-icon name="inbox" /><b>{{ d.enquiries.total }}</b><span>Total enquiries</span></a>
        <a routerLink="/admin/enquiries" [queryParams]="{ status: 'new' }" class="tile"><b>{{ d.enquiries['new'] }}</b><span>New</span></a>
        <a routerLink="/admin/enquiries" [queryParams]="{ status: 'in-progress' }" class="tile"><b>{{ d.enquiries['in-progress'] }}</b><span>In progress</span></a>
        <a routerLink="/admin/enquiries" [queryParams]="{ status: 'resolved' }" class="tile"><b>{{ d.enquiries.resolved }}</b><span>Resolved</span></a>
        <div class="tile"><b>{{ d.enquiries.email }}</b><span>Via email</span></div>
        <div class="tile"><b>{{ d.enquiries.whatsapp }}</b><span>Via WhatsApp</span></div>
        <a routerLink="/admin/posts" class="tile"><b>{{ d.posts }}</b><span>Posts</span></a>
        <a routerLink="/admin/gallery" class="tile"><b>{{ d.photos }}</b><span>Photos</span></a>
      </div>
      <div class="card">
        <h2>Integrations</h2>
        <p><span class="chip" [class.resolved]="d.mailEnabled" [class.new]="!d.mailEnabled">{{ d.mailEnabled ? 'Connected' : 'Not configured' }}</span>
          &nbsp;<b>Email (SMTP)</b>: new enquiries are emailed to the office and the sender gets an acknowledgement.
          @if (!d.mailEnabled) { <span class="muted"> Set MAIL_HOST / MAIL_USERNAME / MAIL_PASSWORD on the server.</span> }</p>
        <p><span class="chip" [class.resolved]="d.whatsappApiEnabled" [class.manual]="!d.whatsappApiEnabled">{{ d.whatsappApiEnabled ? 'Cloud API' : 'Manual mode' }}</span>
          &nbsp;<b>WhatsApp</b>: {{ d.whatsappApiEnabled ? 'bulk messages are sent automatically from the business number.' : 'bulk messages open one WhatsApp chat at a time from your phone or WhatsApp Web.' }}
          @if (!d.whatsappApiEnabled) { <span class="muted"> Set WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID for automatic sending.</span> }</p>
      </div>
    } @else {
      <div class="card">Loading…</div>
    }
  `,
  styles: [`
    .quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .qa { display: grid; grid-template-columns: auto 1fr; column-gap: 14px; align-items: center; padding: 20px; border-radius: 16px; text-decoration: none; background: var(--maroon-grad); color: #fff; transition: transform .25s, box-shadow .25s; }
    .qa:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
    .qa app-icon { grid-row: span 2; width: 44px; height: 44px; padding: 10px; border-radius: 12px; background: var(--gold-grad); color: var(--m-900); }
    .qa b { font-size: 1.05rem; }
    .qa span { color: rgba(255,255,255,.75); font-size: .85rem; }
    .qa.wa { background: linear-gradient(135deg, #1fb855, #0c6b39); }
    .qa.wa app-icon { background: #fff; color: #128c4b; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 20px; text-decoration: none; color: inherit; display: grid; gap: 4px; transition: transform .25s, box-shadow .25s; }
    a.tile:hover { transform: translateY(-4px); box-shadow: var(--shadow); }
    .tile b { font-size: 2rem; font-family: 'Playfair Display', serif; color: var(--m-700); line-height: 1; }
    .tile span { color: var(--muted); font-size: .88rem; }
    .tile.hi { background: var(--maroon-grad); color: #fff; }
    .tile.hi b { color: var(--g-300); }
    .tile.hi span { color: rgba(255,255,255,.8); }
    .tile app-icon { color: var(--g-400); }
  `],
})
export class DashboardComponent {
  readonly d = signal<any>(null);
  constructor() { inject(AdminApi).dashboard().subscribe(d => this.d.set(d)); }
}
