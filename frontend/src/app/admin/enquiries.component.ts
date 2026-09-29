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
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>Enquiries</h1><p>Queries and requests from the Contact page, by email and WhatsApp.</p></div>
      <div class="actions">
        <button class="btn-ghost" (click)="export()" [disabled]="busy()"><app-icon name="download" />
          Excel {{ selected.size ? '(' + selected.size + ' selected)' : '(all ' + total() + ' filtered)' }}</button>
        <button class="btn btn-wa btn-sm" (click)="bulkWhatsApp()" [disabled]="!total()"><app-icon name="whatsapp" />
          WhatsApp {{ selected.size ? selected.size + ' selected' : 'all filtered' }}</button>
      </div>
    </div>

    <!-- ===== Download to Excel ===== -->
    <div class="card dl" id="download" [class.flash]="flash()">
      <h2><app-icon name="download" /> Download to Excel</h2>
      <div class="presets">
        @for (p of presets; track p.key) {
          <button class="pill" [class.on]="dlPreset === p.key" (click)="preset(p.key)">{{ p.label }}</button>
        }
      </div>
      <div class="filters">
        <div class="field"><label>From date</label><input class="input" type="date" [(ngModel)]="dl.from" [max]="dl.to || today" (change)="dlPreset = ''; countRange()"></div>
        <div class="field"><label>To date</label><input class="input" type="date" [(ngModel)]="dl.to" [min]="dl.from" [max]="today" (change)="dlPreset = ''; countRange()"></div>
        <div class="field"><label>Status</label>
          <select class="input" [(ngModel)]="dl.status" (change)="countRange()">
            <option value="">All</option><option value="new">New</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
          </select></div>
        <div class="field"><label>Received via</label>
          <select class="input" [(ngModel)]="dl.channel" (change)="countRange()">
            <option value="">Email + WhatsApp</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
          </select></div>
      </div>
      @if (dlError()) { <p class="err">{{ dlError() }}</p> }
      <div class="actions dl-actions">
        <button class="btn btn-maroon" (click)="downloadRange()" [disabled]="busy() || !!dlError() || rangeCount() === 0">
          <app-icon name="download" /> Download range
          @if (rangeCount() !== null) { <span class="cnt">{{ rangeCount() }}</span> }
        </button>
        <button class="btn" (click)="downloadAll()" [disabled]="busy()">
          <app-icon name="download" /> Download ALL <span class="cnt dark">{{ allCount() }}</span>
        </button>
        <span class="muted">{{ rangeText() }}</span>
      </div>
    </div>

    <div class="card">
      <div class="filters">
        <input class="input grow" placeholder="Search name, phone, district, message…" [(ngModel)]="q.q" (keyup.enter)="search()">
        <select class="input" [(ngModel)]="q.status" (change)="search()">
          <option value="">All statuses</option><option value="new">New</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
        </select>
        <select class="input" [(ngModel)]="q.channel" (change)="search()">
          <option value="">Email + WhatsApp</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
        </select>
        <select class="input" [(ngModel)]="q.type" (change)="search()">
          <option value="">All types</option>
          @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
        </select>
        <input class="input" type="date" [(ngModel)]="q.from" (change)="search()" title="From">
        <input class="input" type="date" [(ngModel)]="q.to" (change)="search()" title="To">
        <button class="btn btn-sm btn-maroon" (click)="search()">Search</button>
        <button class="btn-ghost" (click)="clear()">Clear</button>
      </div>
    </div>

    <div class="card">
      @if (selected.size) {
        <div class="actions selbar">
          <b>{{ selected.size }} selected</b>
          <button class="btn-ghost" (click)="bulkStatus('in-progress')">Mark in progress</button>
          <button class="btn-ghost" (click)="bulkStatus('resolved')">Mark resolved</button>
          <button class="btn-ghost" (click)="remove()"><app-icon name="trash" /> Delete</button>
          <button class="btn-ghost" (click)="selected.clear()">Clear selection</button>
        </div>
      }
      <div class="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" [checked]="allOnPage()" (change)="togglePage($any($event.target).checked)" aria-label="Select page"></th>
              <th>#</th><th>Date</th><th>Name</th><th>Phone</th><th>District</th><th>Type</th><th>Via</th><th>Status</th><th>Message</th>
            </tr>
          </thead>
          <tbody>
            @for (e of rows(); track e.id) {
              <tr class="row" [class.sel]="selected.has(e.id)">
                <td><input type="checkbox" [checked]="selected.has(e.id)" (change)="toggle(e.id)" [attr.aria-label]="'Select ' + e.name"></td>
                <td>{{ e.id }}</td>
                <td class="nowrap">{{ e.createdAt | date: 'dd MMM yy, h:mm a' }}</td>
                <td><b>{{ e.name }}</b>@if (e.email) {<br><a [href]="'mailto:' + e.email" class="muted">{{ e.email }}</a>}</td>
                <td class="nowrap">
                  <a [href]="'tel:' + e.phone">{{ e.phone }}</a>
                  <a class="wa-mini" [href]="'https://wa.me/' + waNum(e.phone)" target="_blank" rel="noopener" title="Chat on WhatsApp"><app-icon name="whatsapp" /></a>
                </td>
                <td>{{ e.district }}@if (e.taluk) {<br><span class="muted">{{ e.taluk }}</span>}</td>
                <td>{{ e.type }}</td>
                <td><span class="chip" [class]="'chip ' + e.channel">{{ e.channel }}</span></td>
                <td>
                  <select #st class="st" [class]="'st ' + e.status" [value]="e.status" (change)="setStatus(e, $any(st.value), st)">
                    <option value="new">New</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
                  </select>
                </td>
                <td class="msg">
                  @if (e.subject) { <b>{{ e.subject }}</b><br> }
                  <span [class.clamp]="open() !== e.id">{{ e.message }}</span>
                  <div class="actions">
                    <button class="link" (click)="open.set(open() === e.id ? null : e.id)">{{ open() === e.id ? 'Less' : 'More / notes' }}</button>
                  </div>
                  @if (open() === e.id) {
                    <textarea class="input notes" rows="3" placeholder="Internal notes (not visible to the sender)" [(ngModel)]="e.notes"></textarea>
                    <button class="btn btn-sm btn-maroon" (click)="saveNotes(e)">Save notes</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="10" class="muted" style="text-align:center; padding: 40px">No enquiries match.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">{{ total() }} total · page {{ page + 1 }} of {{ pages() || 1 }}</span>
        <div class="actions">
          <select class="input" style="width:auto; padding: 8px" [(ngModel)]="size" (change)="search()">
            <option [ngValue]="25">25 / page</option><option [ngValue]="50">50 / page</option><option [ngValue]="100">100 / page</option>
          </select>
          <button class="btn-ghost" [disabled]="page === 0" (click)="go(page - 1)">‹ Prev</button>
          <button class="btn-ghost" [disabled]="page + 1 >= pages()" (click)="go(page + 1)">Next ›</button>
        </div>
      </div>
    </div>

    @if (toast()) { <div class="toast" [class.err]="toastErr">{{ toast() }}</div> }
  `,
  styles: [`
    .nowrap { white-space: nowrap; }
    .wa-mini { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #1fb855; color: #fff; margin-left: 6px; vertical-align: middle; }
    .wa-mini app-icon { width: 15px; height: 15px; }
    .msg { min-width: 280px; max-width: 420px; }
    .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .link { background: none; border: 0; color: var(--m-600); cursor: pointer; padding: 4px 0; font-weight: 600; font-size: .82rem; }
    .notes { margin: 8px 0; min-height: 70px; }
    .st { border: 0; border-radius: 999px; padding: 5px 10px; font-weight: 600; font-size: .78rem; cursor: pointer; }
    .st.new { background: #fde2e4; color: #9a1220; }
    .st.in-progress { background: #fff1c9; color: #8a5a00; }
    .st.resolved { background: #dff5e6; color: #1b6b3a; }
    .selbar { padding: 10px 12px; margin-bottom: 12px; background: var(--cream-2); border-radius: 10px; }
    .dl { border-top: 4px solid var(--g-500); scroll-margin-top: 70px; transition: box-shadow .4s; }
    .dl.flash { box-shadow: 0 0 0 4px rgba(232,182,76,.5), var(--shadow); }
    .dl h2 { display: flex; align-items: center; gap: 8px; }
    .presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .pill { border: 1.5px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-weight: 500; color: var(--m-800); transition: all .2s; }
    .pill:hover { border-color: var(--g-500); }
    .pill.on { background: var(--maroon-grad); color: var(--g-300); border-color: transparent; }
    .dl .field label { font-size: .8rem; }
    .dl-actions { margin-top: 16px; }
    .cnt { background: rgba(255,255,255,.2); border-radius: 999px; padding: 1px 9px; font-size: .8rem; }
    .cnt.dark { background: rgba(58,3,8,.15); }
    .err { color: var(--m-500); margin: 10px 0 0; }
  `],
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
