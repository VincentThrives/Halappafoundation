import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminApi, EnquiryQuery, downloadBlob } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConfirmService } from '../core/confirm.service';
import { ENQUIRY_TYPES } from '../core/i18n';
import { Enquiry } from '../core/models';

@Component({
  selector: 'app-enquiries',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent],
  templateUrl: './enquiries.component.html',
  styleUrls: ['./admin.scss', './enquiries.component.scss'],
})
export class EnquiriesComponent {
  private api = inject(AdminApi);
  private confirmer = inject(ConfirmService);
  private router = inject(Router);

  readonly types = ENQUIRY_TYPES;
  q: EnquiryQuery = { q: '', status: '', channel: '', type: '', from: '', to: '' };
  page = 0;
  size = 25;
  readonly rows = signal<Enquiry[]>([]);
  readonly total = signal(0);
  readonly open = signal<number | null>(null);
  readonly busy = signal(false);
  readonly toast = signal('');
  toastErr = false;
  readonly selected = new Set<number>();

  // ----- Download panel -----
  readonly today = isoDate(new Date());
  readonly presets = [
    { key: 'today', label: 'Today' }, { key: '7d', label: 'Last 7 days' }, { key: 'month', label: 'This month' },
    { key: 'lastMonth', label: 'Last month' }, { key: 'year', label: 'This year' },
  ];
  dl = { from: '', to: '', status: '', channel: '' };
  dlPreset = 'month';
  readonly rangeCount = signal<number | null>(null);
  readonly allCount = signal(0);
  readonly dlError = signal('');
  readonly flash = signal(false);

  constructor() {
    const qp = inject(ActivatedRoute).snapshot.queryParamMap;
    if (qp.get('status')) this.q.status = qp.get('status')!;
    this.load();
    this.preset('month');
    this.api.enquiries({}, 0, 1).subscribe(p => this.allCount.set(p.total));
    if (qp.get('panel') === 'download') {
      setTimeout(() => {
        document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
        this.flash.set(true);
        setTimeout(() => this.flash.set(false), 1600);
      }, 150);
    }
  }

  preset(key: string) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const back = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days); return d; };
    const ranges: Record<string, [Date, Date]> = {
      today: [now, now],
      '7d': [back(6), now],
      month: [new Date(y, m, 1), now],
      lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)],
      year: [new Date(y, 0, 1), now],
    };
    const [f, t] = ranges[key];
    this.dlPreset = key;
    this.dl.from = isoDate(f);
    this.dl.to = isoDate(t);
    this.countRange();
  }

  /** Live count of what "Download range" will contain. */
  countRange() {
    this.dlError.set('');
    if (this.dl.from && this.dl.to && this.dl.from > this.dl.to) {
      this.dlError.set('From date must be on or before To date.');
      this.rangeCount.set(null);
      return;
    }
    this.api.enquiries(this.rangeQuery(), 0, 1).subscribe(p => this.rangeCount.set(p.total));
  }

  rangeText() {
    const f = (s: string) => s ? s.split('-').reverse().join('-') : '';
    if (!this.dl.from && !this.dl.to) return 'No dates chosen: downloads every enquiry matching status/channel.';
    return `${f(this.dl.from) || 'beginning'} to ${f(this.dl.to) || 'today'} (both days included)`;
  }

  downloadRange() {
    if (this.dlError()) return;
    this.runExport(this.api.exportEnquiries(this.rangeQuery()));
  }

  downloadAll() { this.runExport(this.api.exportEnquiries({}, undefined, true)); }

  private rangeQuery(): EnquiryQuery {
    return { from: this.dl.from, to: this.dl.to, status: this.dl.status, channel: this.dl.channel };
  }

  private runExport(req: ReturnType<AdminApi['exportEnquiries']>) {
    this.busy.set(true);
    req.subscribe({
      next: f => { downloadBlob(f.blob, f.name); this.busy.set(false); this.say(`Downloaded ${f.name}`); },
      error: e => { this.busy.set(false); this.say(errMsg(e, 'Export failed'), true); },
    });
  }

  pages() { return Math.ceil(this.total() / this.size); }
  allOnPage() { return this.rows().length > 0 && this.rows().every(r => this.selected.has(r.id)); }
  waNum(p?: string) { const d = (p ?? '').replace(/\D/g, ''); return d.length === 10 ? '91' + d : d; }

  load() {
    this.api.enquiries(this.q, this.page, this.size).subscribe({
      next: p => { this.rows.set(p.items); this.total.set(p.total); },
      error: e => this.say(errMsg(e), true),
    });
  }
  search() { this.page = 0; this.selected.clear(); this.load(); }
  clear() { this.q = { q: '', status: '', channel: '', type: '', from: '', to: '' }; this.search(); }
  go(p: number) { this.page = p; this.load(); }

  toggle(id: number) { this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id); }
  togglePage(on: boolean) { this.rows().forEach(r => on ? this.selected.add(r.id) : this.selected.delete(r.id)); }

  setStatus(e: Enquiry, status: Enquiry['status'], select?: HTMLSelectElement) {
    const before = e.status;
    this.api.updateEnquiry(e.id, { status }).subscribe({
      next: u => { e.status = u.status; this.say('Status updated'); },
      // Put the dropdown back so it never shows a status that wasn't saved.
      error: x => { if (select) select.value = before; this.say(errMsg(x), true); },
    });
  }
  bulkStatus(status: string) {
    const ids = [...this.selected];
    if (!ids.length) return;
    forkJoin(ids.map(id => this.api.updateEnquiry(id, { status }).pipe(map(() => true), catchError(() => of(false)))))
      .subscribe(results => {
        const failed = results.filter(ok => !ok).length;
        this.say(failed ? `${ids.length - failed} updated, ${failed} failed` : `${ids.length} updated`, failed > 0);
        this.load();
      });
  }
  saveNotes(e: Enquiry) {
    this.api.updateEnquiry(e.id, { notes: e.notes ?? '' }).subscribe({ next: () => this.say('Notes saved'), error: x => this.say(errMsg(x), true) });
  }
  async remove() {
    const n = this.selected.size;
    const ok = await this.confirmer.ask({
      title: `Delete ${n} ${n === 1 ? 'enquiry' : 'enquiries'}?`, danger: true,
      message: 'They will be removed permanently and will no longer appear in Excel downloads. This cannot be undone.',
    });
    if (!ok) return;
    this.api.deleteEnquiries([...this.selected]).subscribe({
      next: () => { this.selected.clear(); this.say(`${n} deleted`); this.load(); },
      error: x => this.say(errMsg(x), true),
    });
  }

  export() {
    this.busy.set(true);
    this.api.exportEnquiries(this.q, [...this.selected]).subscribe({
      next: f => { downloadBlob(f.blob, f.name); this.busy.set(false); },
      error: e => { this.busy.set(false); this.say(errMsg(e, 'Export failed'), true); },
    });
  }

  bulkWhatsApp() {
    const state = this.selected.size
      ? { ids: [...this.selected], label: `${this.selected.size} selected enquiries` }
      : { filter: { ...this.q }, label: `All ${this.total()} enquiries matching the current filters` };
    this.router.navigateByUrl('/admin/messages/new', { state });
  }

  private toastTimer?: ReturnType<typeof setTimeout>;
  private say(msg: string, err = false) {
    this.toastErr = err;
    this.toast.set(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }
}

/** yyyy-MM-dd in local time (toISOString would shift the day in IST). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
