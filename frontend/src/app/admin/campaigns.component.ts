import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminApi, downloadBlob } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { CampaignView, Channels, Message } from '../core/models';

const CH_ICON: Record<string, string> = { whatsapp: 'whatsapp', email: 'mail', sms: 'phone' };

/** List of all bulk sends + connection status of each channel. */
@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>Bulk messages</h1><p>WhatsApp, email and SMS sends with entrance vouchers.</p></div>
      <a routerLink="/admin/messages/new" class="btn btn-maroon btn-sm"><app-icon name="plus" /> New bulk message</a>
    </div>

    @if (ch(); as c) {
      <div class="conn">
        <div class="c"><app-icon name="whatsapp" /><b>WhatsApp</b>
          <span class="chip" [class.resolved]="c.whatsappApi" [class.manual]="!c.whatsappApi">{{ c.whatsappApi ? 'Automatic' : 'Manual links' }}</span>
          <span class="chip" [class.resolved]="c.whatsappInbound" [class.new]="!c.whatsappInbound">{{ c.whatsappInbound ? 'Receiving replies' : 'Replies not connected' }}</span></div>
        <div class="c"><app-icon name="mail" /><b>Email</b>
          <span class="chip" [class.resolved]="c.email" [class.new]="!c.email">{{ c.email ? 'Sending' : 'Not connected' }}</span>
          <span class="chip" [class.resolved]="c.emailInbound" [class.new]="!c.emailInbound">{{ c.emailInbound ? 'Reading inbox' : 'Inbox not connected' }}</span></div>
        <div class="c"><app-icon name="phone" /><b>SMS</b>
          <span class="chip" [class.resolved]="c.sms" [class.new]="!c.sms">{{ c.sms ? 'Sending (MSG91)' : 'Not connected' }}</span>
          <span class="chip" [class.resolved]="c.smsInbound" [class.new]="!c.smsInbound">{{ c.smsInbound ? 'Receiving' : 'Incoming not connected' }}</span></div>
      </div>
    }

    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>#</th><th>When</th><th>Send</th><th>By</th><th>Vouchers</th><th>Sent</th><th>Failed</th><th>Attended</th><th>Status</th></tr></thead>
          <tbody>
            @for (v of list(); track v.campaign.id) {
              <tr class="row">
                <td>{{ v.campaign.id }}</td>
                <td class="nowrap">{{ v.campaign.createdAt | date: 'dd MMM yy, h:mm a' }}</td>
                <td><a [routerLink]="['/admin/messages', v.campaign.id]"><b>{{ v.campaign.name }}</b></a></td>
                <td><span class="chip manual"><app-icon [name]="icon(v.campaign.channel)" /> {{ v.campaign.channel }}{{ v.campaign.mode === 'manual' ? ' · manual' : '' }}</span></td>
                <td class="mono">{{ v.campaign.voucherInfo || '—' }}</td>
                <td>{{ v.stats.sent }} / {{ v.stats.total }}</td>
                <td>{{ v.stats.failed }}</td>
                <td>{{ v.stats.attended }}</td>
                <td><span class="chip st-{{ v.campaign.status }}">{{ v.campaign.status }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="muted" style="text-align:center; padding: 30px">No bulk messages yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .conn { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .c { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .c > app-icon { color: var(--m-700); }
    .c b { margin-right: auto; }
    .mono { font-family: monospace; }
    .nowrap { white-space: nowrap; }
    .chip app-icon { width: 14px; height: 14px; vertical-align: -2px; }
    .st-running { background: #dff0ff; color: #0b5a9a; } .st-done { background: #dff5e6; color: #1b6b3a; }
    .st-paused, .st-manual { background: #fff1c9; color: #8a5a00; } .st-cancelled { background: #eee; color: #555; }
    @media (max-width: 900px) { .conn { grid-template-columns: 1fr; } }
  `],
})
export class CampaignsComponent {
  private api = inject(AdminApi);
  readonly list = signal<CampaignView[]>([]);
  readonly ch = signal<Channels | null>(null);
  constructor() {
    this.api.campaigns().subscribe(l => this.list.set(l));
    this.api.channels().subscribe(c => this.ch.set(c));
  }
  icon(c: string) { return CH_ICON[c] ?? 'send'; }
}

/** One send: live progress, controls, recipients with vouchers, manual WhatsApp links, Excel export. */
@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TitleCasePipe, FormsModule, IconComponent],
  styleUrl: './admin.scss',
  template: `
    @if (v(); as v) {
      <div class="head">
        <div>
          <h1>{{ v.campaign.name }}</h1>
          <p>{{ v.campaign.channel | titlecase }}{{ v.campaign.mode === 'manual' ? ' (manual links)' : '' }} ·
            {{ v.campaign.createdAt | date: 'dd MMM yyyy, h:mm a' }}
            @if (v.campaign.voucherInfo) { · Vouchers <b class="mono">{{ v.campaign.voucherInfo }}</b> }</p>
        </div>
        <div class="actions">
          <a routerLink="/admin/messages" class="btn-ghost">← All sends</a>
          <button class="btn-ghost" (click)="export()"><app-icon name="download" /> Excel with vouchers</button>
          @if (v.campaign.status === 'running') { <button class="btn-ghost" (click)="act('pause')">Pause</button> }
          @if (v.campaign.status === 'paused') { <button class="btn-ghost" (click)="act('resume')">Resume</button> }
          @if (['running', 'paused', 'manual'].includes(v.campaign.status)) { <button class="btn-ghost" (click)="act('cancel')">Cancel</button> }
          @if (v.stats.failed && v.campaign.mode === 'api' && v.campaign.status !== 'running') {
            <button class="btn btn-sm btn-maroon" (click)="act('retry-failed')">Retry {{ v.stats.failed }} failed</button>
          }
        </div>
      </div>

      <div class="card">
        <div class="bar"><i class="ok" [style.width.%]="pct(v.stats.sent)"></i><i class="bad" [style.width.%]="pct(v.stats.failed)"></i></div>
        <div class="nums">
          <div><b>{{ v.stats.total }}</b><span>Total</span></div>
          @if (v.campaign.mode === 'manual') { <div><b>{{ v.stats.manual }}</b><span>To open</span></div> }
          @else { <div><b>{{ v.stats.queued }}</b><span>Waiting</span></div> }
          <div><b>{{ v.stats.sent }}</b><span>Sent</span></div>
          @if (v.campaign.channel === 'whatsapp' && v.campaign.mode === 'api') {
            <div><b>{{ v.stats.delivered }}</b><span>Delivered</span></div>
            <div><b>{{ v.stats.read }}</b><span>Read</span></div>
          }
          <div><b class="red">{{ v.stats.failed }}</b><span>Failed</span></div>
          <div><b>{{ v.stats.attended }}</b><span>Attended</span></div>
          <div><span class="chip st-{{ v.campaign.status }}">{{ v.campaign.status }}</span></div>
        </div>
      </div>

      @if (v.campaign.mode === 'manual' && v.stats.manual > 0) {
        <div class="card stack">
          <p class="muted" style="margin:0">Each click opens WhatsApp (phone or WhatsApp Web) with this person's message and voucher ready. Press send there, come back, open the next.</p>
          <div><button class="btn btn-wa" (click)="openNext()"><app-icon name="whatsapp" /> Open next ({{ v.stats.total - v.stats.manual + 1 }} of {{ v.stats.total }})</button></div>
        </div>
      }

      <div class="card">
        <div class="filters" style="margin-bottom: 12px">
          <input class="input grow" placeholder="Search name, number, voucher…" [(ngModel)]="q" (keyup.enter)="load(0)">
          <select class="input" [(ngModel)]="status" (change)="load(0)">
            <option value="">All</option><option value="queued">Waiting</option><option value="manual">To open</option>
            <option value="sent">Sent</option><option value="read">Read</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>{{ v.campaign.channel === 'email' ? 'Email' : 'Number' }}</th><th>Voucher</th><th>Status</th><th>Message</th><th></th></tr></thead>
            <tbody>
              @for (m of rows(); track m.id) {
                <tr class="row">
                  <td>{{ m.name || '—' }}</td>
                  <td class="nowrap">{{ m.contact }}</td>
                  <td class="mono">{{ m.voucher }}@if (m.attendedAt) { <span class="chip resolved">attended</span> }</td>
                  <td><span class="chip st-{{ m.status }}">{{ m.status }}</span>@if (m.error) {<br><small class="red">{{ m.error }}</small>}</td>
                  <td class="msg">{{ m.body }}</td>
                  <td>
                    @if (m.status === 'manual') {
                      <a class="btn-ghost" [href]="waLink(m)" target="_blank" rel="noopener" (click)="opened(m)"><app-icon name="whatsapp" /> Open</a>
                    }
                  </td>
                </tr>
              } @empty { <tr><td colspan="6" class="muted">Nothing here.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span class="muted">{{ total() }} people</span>
          <div class="actions">
            <button class="btn-ghost" [disabled]="page === 0" (click)="load(page - 1)">‹ Prev</button>
            <button class="btn-ghost" [disabled]="(page + 1) * 50 >= total()" (click)="load(page + 1)">Next ›</button>
          </div>
        </div>
      </div>
    }
    @if (toast()) { <div class="toast" [class.err]="toastErr">{{ toast() }}</div> }
  `,
  styles: [`
    .mono { font-family: monospace; }
    .nowrap { white-space: nowrap; }
    .red { color: #b3261e; }
    .msg { max-width: 360px; white-space: pre-wrap; font-size: .85rem; color: var(--muted); }
    .bar { height: 12px; border-radius: 12px; background: var(--cream-2); overflow: hidden; display: flex; }
    .bar i { display: block; height: 100%; transition: width .5s; }
    .bar .ok { background: linear-gradient(90deg, #2bd46a, #128c4b); }
    .bar .bad { background: #d9534f; }
    .nums { display: flex; flex-wrap: wrap; gap: 26px; margin-top: 16px; align-items: center; }
    .nums b { display: block; font-size: 1.8rem; font-family: 'Playfair Display', serif; color: var(--m-700); line-height: 1; }
    .nums span { color: var(--muted); font-size: .8rem; }
    .st-running, .st-queued { background: #dff0ff; color: #0b5a9a; }
    .st-done, .st-sent, .st-delivered, .st-read { background: #dff5e6; color: #1b6b3a; }
    .st-paused, .st-manual { background: #fff1c9; color: #8a5a00; }
    .st-cancelled { background: #eee; color: #555; }
    .st-failed { background: #fde2e4; color: #9a1220; }
  `],
})
export class CampaignDetailComponent implements OnDestroy {
  private api = inject(AdminApi);
  private confirmer = inject(ConfirmService);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly v = signal<CampaignView | null>(null);
  readonly rows = signal<Message[]>([]);
  readonly total = signal(0);
  readonly toast = signal('');
  toastErr = false;
  page = 0;
  q = '';
  status = '';
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.refresh();
    this.load(0);
    // Live progress while the send is running.
    this.timer = setInterval(() => {
      if (this.v()?.campaign.status === 'running') { this.refresh(); this.load(this.page); }
    }, 2000);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  refresh() { this.api.campaign(this.id).subscribe(v => this.v.set(v)); }

  load(p: number) {
    this.page = p;
    this.api.campaignRecipients(this.id, this.status, this.q, p).subscribe(r => { this.rows.set(r.items); this.total.set(r.total); });
  }

  pct(n: number) { const t = this.v()?.stats.total || 1; return (n / t) * 100; }

  async act(a: 'pause' | 'resume' | 'cancel' | 'retry-failed') {
    if (a === 'cancel') {
      const ok = await this.confirmer.ask({
        title: 'Stop this send?', detail: this.v()?.campaign.name, danger: true, icon: 'close', confirmText: 'Stop sending',
        cancelText: 'Keep sending', message: 'People who have not been messaged yet will not receive it.',
      });
      if (!ok) return;
    }
    this.api.campaignAction(this.id, a).subscribe({
      next: v => { this.v.set(v); this.load(this.page); this.say(a === 'retry-failed' ? 'Retrying failed messages…' : 'Done'); },
      error: e => this.say(errMsg(e), true),
    });
  }

  export() { this.api.exportCampaign(this.id).subscribe(f => downloadBlob(f.blob, f.name)); }

  waLink(m: Message) { return `https://wa.me/${m.contact}?text=${encodeURIComponent(m.body ?? '')}`; }

  opened(m: Message) {
    this.api.manualSent(this.id, m.id).subscribe(u => {
      this.rows.set(this.rows().map(r => (r.id === u.id ? u : r)));
      this.refresh();
    });
  }

  /** Finds the next person still to message (fetching if the current page has none) and opens their chat. */
  openNext() {
    const next = this.rows().find(r => r.status === 'manual');
    if (next) { window.open(this.waLink(next), '_blank', 'noopener'); this.opened(next); return; }
    this.api.campaignRecipients(this.id, 'manual', '', 0, 1).subscribe(r => {
      const m = r.items[0];
      if (m) { window.open(this.waLink(m), '_blank', 'noopener'); this.opened(m); }
    });
  }

  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Shows a message; a newer message restarts the timer instead of being cut short by the older one. */
  private say(m: string, err = false) {
    this.toastErr = err;
    this.toast.set(m);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }
}
