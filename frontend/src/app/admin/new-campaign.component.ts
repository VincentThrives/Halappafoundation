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
  templateUrl: './new-campaign.component.html',
  styleUrls: ['./admin.scss', './new-campaign.component.scss'],
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
