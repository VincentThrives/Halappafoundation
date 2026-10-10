import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminApi, downloadBlob } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { CampaignView, Message } from '../core/models';

/** One send: live progress, controls, recipients with vouchers, manual WhatsApp links, Excel export. */
@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, TitleCasePipe, FormsModule, IconComponent],
  templateUrl: './campaign-detail.component.html',
  styleUrls: ['./admin.scss', './campaign-detail.component.scss'],
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
