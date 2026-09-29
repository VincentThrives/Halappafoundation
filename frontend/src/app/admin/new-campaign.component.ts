import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, EnquiryQuery, downloadBlob } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { Channels, ImportResult } from '../core/models';

type ChannelKey = 'whatsapp' | 'email' | 'sms';
type Source = 'excel' | 'given' | 'range' | 'all' | 'pasted';
type VoucherMode = 'auto' | 'excel' | 'fixed';

export const DEFAULT_INVITE =
  'Namaskara {name},\n' +
  'Halappa Foundation invites you to the Kit Distribution Programme.\n' +
  'Your entrance voucher number: {voucher}\n' +
  'Please show this message at the entrance.\n\n' +
  'ನಮಸ್ಕಾರ {name}, ಹಾಲಪ್ಪ ಪ್ರತಿಷ್ಠಾನದ ಕಿಟ್ ವಿತರಣಾ ಕಾರ್ಯಕ್ರಮಕ್ಕೆ ನಿಮ್ಮನ್ನು ಆತ್ಮೀಯವಾಗಿ ಆಹ್ವಾನಿಸುತ್ತೇವೆ.\n' +
  'ನಿಮ್ಮ ಪ್ರವೇಶ ಚೀಟಿ ಸಂಖ್ಯೆ: {voucher}';

/** "New bulk message": channel → recipients (Excel / enquiries / pasted) → entrance voucher → message → send. */
@Component({
  selector: 'app-new-campaign',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>New bulk message</h1><p>Send up to {{ max() }} WhatsApp messages, emails or SMS in one go, each with its own entrance voucher.</p></div>
      <a routerLink="/admin/messages" class="btn-ghost">← All sends</a>
    </div>

    <!-- 1. Channel -->
    <div class="card stack">
      <h2>1 · Send by</h2>
      <div class="ch-grid">
        @for (c of channelCards; track c.key) {
          <button class="ch" [class.on]="channel === c.key" [class.off]="!available(c.key)" (click)="pickChannel(c.key)">
            <app-icon [name]="c.icon" />
            <b>{{ c.label }}</b>
            <small>{{ status(c.key) }}</small>
          </button>
        }
      </div>
      @if (channel === 'whatsapp' && !ch()?.whatsappApi) {
        <p class="note">WhatsApp Business API isn't connected yet, so this send will be <b>manual</b>: you'll open each chat with the message ready and press send.
          For 5000 people, connect the API (WHATSAPP_TOKEN) so it sends automatically.</p>
      }
    </div>

    <!-- 2. Recipients -->
    <div class="card stack">
      <h2>2 · Who receives it</h2>
      <div class="src">
        <label class="opt"><input type="radio" name="src" [ngModel]="source" (ngModelChange)="source = $event; onSource()" value="excel"> Import an Excel / CSV file</label>
        @if (given) { <label class="opt"><input type="radio" name="src" [ngModel]="source" (ngModelChange)="source = $event; onSource()" value="given"> {{ given.label }}</label> }
        <label class="opt"><input type="radio" name="src" [ngModel]="source" (ngModelChange)="source = $event; onSource()" value="range"> Everyone who contacted us between dates</label>
        <label class="opt"><input type="radio" name="src" [ngModel]="source" (ngModelChange)="source = $event; onSource()" value="all"> Everyone who has ever contacted us</label>
        <label class="opt"><input type="radio" name="src" [ngModel]="source" (ngModelChange)="source = $event; onSource()" value="pasted"> Only numbers / emails I paste</label>
      </div>

      @if (source === 'excel') {
        <div class="import">
          <label class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)">
            <input type="file" accept=".xlsx,.xls,.csv" (change)="pick($event)">
            <app-icon name="download" class="up" />
            <span>{{ importing() ? 'Reading file…' : fileName() || 'Click or drop the Excel file here (.xlsx, .xls or .csv)' }}</span>
            <small>Columns: <b>Name</b>, <b>Phone</b>, Email, Voucher (any order, Kannada headings OK)</small>
          </label>
          <button class="link" (click)="template()"><app-icon name="download" /> Download a sample Excel</button>
        </div>
        @if (imported(); as r) {
          <div class="summary">
            <span class="chip resolved">{{ r.rows.length }} ready</span>
            @if (r.problems.length) { <span class="chip new">{{ r.problems.length }} skipped</span> }
            <span class="muted">{{ r.totalRows }} rows in file{{ r.hasVoucherColumn ? ' · has a Voucher column' : '' }}</span>
          </div>
          @if (r.problems.length) {
            <details><summary>Show skipped rows</summary>
              <ul class="problems">@for (p of r.problems.slice(0, 200); track $index) { <li>Row {{ p.row }}: {{ p.reason }}</li> }</ul>
            </details>
          }
          <div class="tbl-wrap preview">
            <table>
              <thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>Email</th><th>Voucher</th></tr></thead>
              <tbody>
                @for (row of r.rows.slice(0, 8); track row.row) {
                  <tr><td>{{ row.row }}</td><td>{{ row.name }}</td><td>{{ row.phone }}</td><td>{{ row.email }}</td><td>{{ row.voucher }}</td></tr>
                }
              </tbody>
            </table>
            @if (r.rows.length > 8) { <p class="muted">…and {{ r.rows.length - 8 }} more</p> }
          </div>
        }
      }
      @if (source === 'range') {
        <div class="filters">
          <div class="field"><label>From date</label><input class="input" type="date" [(ngModel)]="rangeFrom" (change)="count()"></div>
          <div class="field"><label>To date</label><input class="input" type="date" [(ngModel)]="rangeTo" (change)="count()"></div>
        </div>
      }
      <div class="field">
        <label>{{ source === 'pasted' ? 'Numbers / emails' : 'Also add these (optional)' }} <span class="muted">— comma, space or one per line</span></label>
        <textarea class="input" rows="2" [(ngModel)]="pasted" [placeholder]="channel === 'email' ? 'a@example.com, b@example.com' : '9876543210, +91 91234 56789'"></textarea>
      </div>
      <p class="count"><app-icon name="inbox" /> About <b>{{ estimate() }}</b> recipient{{ estimate() === 1 ? '' : 's' }}
        @if (estimate() > max()) { <span class="err"> — over the {{ max() }} limit</span> }</p>
    </div>

    <!-- 3. Voucher -->
    <div class="card stack">
      <h2>3 · Entrance voucher</h2>
      <label class="opt"><input type="checkbox" [(ngModel)]="voucherOn"> Give each person an entrance voucher number (shown with {{ voucherToken }} in the message)</label>
      @if (voucherOn) {
        <div class="src">
          <label class="opt"><input type="radio" name="vm" [(ngModel)]="voucherMode" value="auto"> Number them automatically</label>
          <label class="opt" [class.dim]="!imported()?.hasVoucherColumn"><input type="radio" name="vm" [(ngModel)]="voucherMode" value="excel" [disabled]="source !== 'excel' || !imported()?.hasVoucherColumn">
            Use the voucher numbers from my Excel file</label>
          <label class="opt"><input type="radio" name="vm" [(ngModel)]="voucherMode" value="fixed"> Same code for everyone</label>
        </div>
        @if (voucherMode === 'auto') {
          <div class="grid3">
            <div class="field"><label>Prefix</label><input class="input" [(ngModel)]="prefix" maxlength="30"></div>
            <div class="field"><label>Start at</label><input class="input" type="number" min="0" [(ngModel)]="start"></div>
            <div class="field"><label>Digits</label><input class="input" type="number" min="1" max="8" [(ngModel)]="digits"></div>
          </div>
        }
        @if (voucherMode === 'fixed') {
          <div class="field"><label>Voucher code</label><input class="input" [(ngModel)]="fixed" placeholder="MADHUGIRI-KIT"></div>
        }
        <p class="muted">Example: <b class="vch">{{ sampleVoucher() || '—' }}</b></p>
      }
    </div>

    <!-- 4. Message -->
    <div class="card stack">
      <h2>4 · Message</h2>
      <div class="field"><label>Name of this send (for your records)</label><input class="input" [(ngModel)]="name" maxlength="200"></div>
      @if (channel === 'email') {
        <div class="field"><label>Email subject</label><input class="input" [(ngModel)]="subject" maxlength="300"></div>
      }
      <div class="field">
        <label>Message <span class="muted">— {{ nameToken }} and {{ voucherToken }} are filled in for each person</span></label>
        <textarea class="input" rows="8" [(ngModel)]="message" maxlength="4000"></textarea>
        <span class="muted">{{ message.length }} / 4000</span>
      </div>
      @if (!voucherOn && message.includes(voucherToken)) { <p class="warn">The message has {{ voucherToken }} but vouchers are switched off — it will be left blank.</p> }
      @if (channel === 'whatsapp' && ch()?.whatsappApi) {
        <div class="grid2">
          <div class="field"><label>Approved WhatsApp template name <span class="muted">(needed for people who haven't messaged you in 24h)</span></label>
            <input class="input" [(ngModel)]="templateName" placeholder="kit_invite"></div>
          <div class="field"><label>Template language</label>
            <select class="input" [(ngModel)]="templateLang"><option value="en">English (en)</option><option value="kn">Kannada (kn)</option></select></div>
        </div>
        <p class="muted">In the template, {{ tpl1 }} = name and {{ tpl2 }} = voucher number.</p>
        <label class="opt"><input type="checkbox" [(ngModel)]="manual"> Send by hand with WhatsApp links instead</label>
      }
      @if (channel === 'sms') {
        <p class="note">SMS in India must match your DLT-approved template in MSG91 (variables <b>##name##</b> and <b>##voucher##</b>). The text here is kept for your records.</p>
      }
      <div class="preview-msg">
        <small>Preview for the first person</small>
        @if (channel === 'email') { <div class="subj">{{ previewSubject() }}</div> }
        <div class="bubble" [class.mail]="channel === 'email'">{{ preview() }}</div>
      </div>
    </div>

    <div class="card send-bar">
      @if (error()) { <p class="err">{{ error() }}</p> }
      <button class="btn btn-maroon" (click)="send()" [disabled]="busy()">
        <app-icon name="send" /> {{ busy() ? 'Preparing…' : 'Send to ' + estimate() + ' people' }}
      </button>
    </div>
  `,
  styles: [`
    .ch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .ch { display: grid; justify-items: start; gap: 4px; padding: 16px; border-radius: 14px; border: 2px solid var(--line); background: #fff; cursor: pointer; text-align: left; }
    .ch app-icon { width: 28px; height: 28px; color: var(--m-700); }
    .ch.on { border-color: var(--m-700); background: var(--cream); box-shadow: var(--shadow); }
    .ch.off small { color: var(--m-500); }
    .ch small { color: var(--muted); font-size: .78rem; }
    .src { display: grid; gap: 8px; }
    .opt { display: block; padding-left: 26px; position: relative; line-height: 1.5; }
    .opt input { position: absolute; left: 0; top: 4px; margin: 0; }
    .opt.dim { color: var(--muted); }
    .import { display: grid; gap: 8px; }
    .drop { position: relative; display: grid; justify-items: center; gap: 6px; padding: 26px; border: 2px dashed var(--line); border-radius: 14px; cursor: pointer; color: var(--muted); text-align: center; }
    .drop.over, .drop:hover { border-color: var(--g-500); background: var(--cream); }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop .up { width: 36px; height: 36px; color: var(--g-600); transform: rotate(180deg); }
    .link { background: none; border: 0; color: var(--m-600); font-weight: 600; cursor: pointer; justify-self: start; display: inline-flex; gap: 6px; align-items: center; }
    .summary { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .problems { max-height: 180px; overflow: auto; font-size: .85rem; color: var(--m-600); }
    .preview { max-height: 300px; }
    .count { display: flex; align-items: center; gap: 8px; margin: 0; }
    .note { background: #fff7e0; border-left: 4px solid var(--g-500); padding: 10px 14px; border-radius: 8px; margin: 0; font-size: .9rem; }
    .warn { color: #8a5a00; margin: 0; }
    .vch { font-family: monospace; font-size: 1.05rem; color: var(--m-700); }
    .preview-msg small { color: var(--muted); }
    .subj { font-weight: 600; margin-top: 6px; }
    .bubble { margin-top: 6px; max-width: 460px; background: #dcf8c6; border-radius: 12px 12px 12px 2px; padding: 12px 14px; white-space: pre-wrap; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
    .bubble.mail { background: #fff; border: 1px solid var(--line); max-width: 620px; }
    .send-bar { display: flex; gap: 14px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
    @media (min-width: 900px) { .send-bar { position: sticky; bottom: 10px; } }
    .err { color: var(--m-500); margin: 0; }
    @media (max-width: 700px) { .ch-grid { grid-template-columns: 1fr; } }
  `],
})
export class NewCampaignComponent {
  private api = inject(AdminApi);
  private confirmer = inject(ConfirmService);
  private router = inject(Router);

  readonly nameToken = '{name}';
  readonly voucherToken = '{voucher}';
  readonly tpl1 = '{{1}}';
  readonly tpl2 = '{{2}}';
  readonly channelCards: { key: ChannelKey; label: string; icon: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
    { key: 'email', label: 'Email', icon: 'mail' },
    { key: 'sms', label: 'SMS', icon: 'phone' },
  ];

  /** Selection handed over from the Enquiries page. */
  readonly given: { ids?: number[]; filter?: EnquiryQuery; label: string } | null = history.state?.label ? history.state : null;

  readonly ch = signal<Channels | null>(null);
  readonly max = computed(() => this.ch()?.maxRecipients ?? 5000);
  channel: ChannelKey = 'whatsapp';
  source: Source = this.given ? 'given' : 'excel';
  readonly imported = signal<ImportResult | null>(null);
  readonly fileName = signal('');
  readonly importing = signal(false);
  readonly over = signal(false);
  rangeFrom = '';
  rangeTo = '';
  pasted = '';
  private enquiryCount = signal(0);

  voucherOn = true;
  voucherMode: VoucherMode = 'auto';
  prefix = 'KIT-' + new Date().getFullYear() + '-';
  start = 1;
  digits = 4;
  fixed = '';

  name = 'Kit distribution programme';
  subject = 'Invitation: Kit Distribution Programme | Halappa Foundation';
  message = DEFAULT_INVITE;
  templateName = '';
  templateLang = 'en';
  manual = false;

  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    this.api.channels().subscribe(c => this.ch.set(c));
    if (this.given?.ids) this.enquiryCount.set(this.given.ids.length);
    else if (this.given?.filter) this.api.enquiries(this.given.filter, 0, 1).subscribe(p => this.enquiryCount.set(p.total));
  }

  // ---------- channel ----------
  available(c: ChannelKey) {
    const s = this.ch();
    return !s ? true : c === 'whatsapp' ? true : c === 'email' ? s.email : s.sms;
  }
  status(c: ChannelKey) {
    const s = this.ch();
    if (!s) return '…';
    if (c === 'whatsapp') return s.whatsappApi ? 'Connected (automatic)' : 'Manual mode (API not connected)';
    return (c === 'email' ? s.email : s.sms) ? 'Connected' : 'Not connected';
  }
  pickChannel(c: ChannelKey) { this.channel = c; this.error.set(''); }

  // ---------- recipients ----------
  pick(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.upload(f); }
  drop(e: DragEvent) { e.preventDefault(); this.over.set(false); const f = e.dataTransfer?.files?.[0]; if (f) this.upload(f); }

  upload(file: File) {
    this.error.set('');
    this.importing.set(true);
    this.fileName.set(file.name);
    this.api.importRecipients(file).subscribe({
      next: r => {
        this.importing.set(false);
        this.imported.set(r);
        this.voucherMode = r.hasVoucherColumn ? 'excel' : 'auto';
      },
      error: e => { this.importing.set(false); this.imported.set(null); this.error.set(errMsg(e, 'Could not read the file')); },
    });
  }

  template() { this.api.recipientsTemplate().subscribe(f => downloadBlob(f.blob, f.name)); }

  count() {
    const f = this.source === 'range' ? { from: this.rangeFrom, to: this.rangeTo } : {};
    this.api.enquiries(f, 0, 1).subscribe(p => this.enquiryCount.set(p.total));
  }

  pastedCount(): number {
    if (!this.pasted.trim()) return 0;
    return this.pasted.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).length;
  }

  estimate(): number {
    const base = this.source === 'excel' ? this.imported()?.rows.filter(r => this.channel === 'email' ? r.email : r.phone).length ?? 0
      : this.source === 'pasted' ? 0 : this.enquiryCountFor();
    return base + this.pastedCount();
  }

  private enquiryCountFor(): number { return this.enquiryCount(); }

  /** Recount enquiries whenever the recipient source changes. */
  onSource() {
    if (this.source === 'all' || this.source === 'range') this.count();
    else if (this.source === 'given') {
      if (this.given?.ids) this.enquiryCount.set(this.given.ids.length);
      else if (this.given?.filter) this.api.enquiries(this.given.filter, 0, 1).subscribe(p => this.enquiryCount.set(p.total));
    }
  }

  // ---------- voucher ----------
  sampleVoucher(): string {
    if (!this.voucherOn) return '';
    if (this.voucherMode === 'fixed') return this.fixed.trim().toUpperCase();
    if (this.voucherMode === 'excel') return (this.imported()?.rows[0]?.voucher ?? '').toUpperCase();
    return (this.prefix ?? '').trim().toUpperCase() + String(this.start ?? 1).padStart(Math.max(1, Math.min(this.digits || 4, 8)), '0');
  }

  private firstName(): string {
    return (this.source === 'excel' ? this.imported()?.rows[0]?.name : '') || 'Ramesh';
  }

  preview() { return personalise(this.message, this.firstName(), this.sampleVoucher()); }
  previewSubject() { return personalise(this.subject, this.firstName(), this.sampleVoucher()); }

  // ---------- send ----------
  body(): Record<string, unknown> {
    const b: Record<string, unknown> = {
      name: this.name, channel: this.channel, subject: this.subject, message: this.message,
      template: this.channel === 'whatsapp' && !this.manual ? this.templateName : '', templateLang: this.templateLang,
      manual: this.manual, pasted: this.pasted,
      voucher: this.voucherOn
        ? { mode: this.voucherMode, prefix: this.prefix, start: this.start, digits: this.digits, fixed: this.fixed }
        : { mode: 'none' },
    };
    if (this.source === 'excel') b['people'] = this.imported()?.rows ?? [];
    if (this.source === 'given' && this.given?.ids) b['enquiryIds'] = this.given.ids;
    if (this.source === 'given' && this.given?.filter) {
      const f = this.given.filter;
      Object.assign(b, { allEnquiries: true, q: f.q, status: f.status, enquiryChannel: f.channel, type: f.type, from: f.from || null, to: f.to || null });
    }
    if (this.source === 'range') Object.assign(b, { allEnquiries: true, from: this.rangeFrom || null, to: this.rangeTo || null });
    if (this.source === 'all') b['allEnquiries'] = true;
    return b;
  }

  async send() {
    this.error.set('');
    if (this.source === 'excel' && !this.imported()) { this.error.set('Import an Excel file first.'); return; }
    if (this.source === 'range' && this.rangeFrom && this.rangeTo && this.rangeFrom > this.rangeTo) { this.error.set('From date must be on or before To date.'); return; }
    if (this.source === 'pasted' && !this.pasted.trim()) { this.error.set('Paste at least one number or email.'); return; }
    if (this.estimate() > this.max()) { this.error.set(`That's more than ${this.max()} people. Split the list into smaller sends.`); return; }
    const via = { whatsapp: 'WhatsApp', email: 'email', sms: 'SMS' }[this.channel];
    const ok = await this.confirmer.ask({
      title: `Send to ${this.estimate()} people?`, detail: this.name, icon: 'send', confirmText: 'Send now',
      message: `This goes out by ${via}${this.voucherOn ? ', each with their own entrance voucher' : ''}. Messages that have been sent can't be taken back.`,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.createCampaign(this.body()).subscribe({
      next: v => { this.busy.set(false); this.router.navigate(['/admin/messages', v.campaign.id]); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }
}

/** Same rules as the server: fills {name}/{voucher} and tidies the gap a blank name leaves. */
export function personalise(msg: string, name: string, voucher: string): string {
  return (msg ?? '').replaceAll('{name}', (name ?? '').trim()).replaceAll('{voucher}', voucher ?? '')
    .replace(/[ \t]{2,}/g, ' ').replaceAll(' ,', ',').trim();
}
