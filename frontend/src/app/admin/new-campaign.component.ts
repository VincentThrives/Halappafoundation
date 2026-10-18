import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi, EnquiryQuery, downloadBlob } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { Channels, ImportResult, SmsTemplate, WaTemplate, WalletInfo, rupees } from '../core/models';

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
  /** The approved template's text (picked from the list, or pasted) and what fills its {{1}}, {{2}}… */
  templateBody = '';
  templateParams: string[] = [];
  readonly templates = signal<WaTemplate[]>([]);
  readonly templatesNote = signal('');
  readonly templatesLoaded = signal(false);
  readonly templatesLoading = signal(false);
  /** True when MSG91 answered with the list (even an empty one); false = not listable here or an error. */
  readonly templatesAvailable = signal(false);
  manual = false;

  readonly busy = signal(false);
  readonly error = signal('');

  // ---------- wallet ----------
  readonly rupees = rupees;
  readonly wallet = signal<WalletInfo | null>(null);
  /** Automatic sends through a provider are charged; "send by hand" WhatsApp links are free. */
  private automatic(): boolean {
    const c = this.ch();
    if (!c) return false;
    if (this.channel === 'whatsapp') return c.whatsappApi && !this.manual;
    return this.channel === 'email' ? c.email : c.sms;
  }
  rate(): number {
    const w = this.wallet();
    if (!w || w.superAdmin || !this.automatic()) return 0;
    return this.channel === 'whatsapp' ? w.rates.whatsappPaise : this.channel === 'sms' ? w.rates.smsPaise : w.rates.emailPaise;
  }
  paid(): boolean { return this.rate() > 0; }
  /** Why this send costs nothing (shown instead of the cost line). */
  freeReason(): string {
    if (this.channel === 'whatsapp' && (this.manual || !this.ch()?.whatsappApi)) return 'sending by hand with WhatsApp links';
    if (!this.automatic()) return 'this channel isn\'t connected';
    return 'the price for this channel is ₹0';
  }
  costPaise(): number { return this.estimate() * this.rate(); }
  short(): boolean { const w = this.wallet(); return !!w && this.paid() && this.costPaise() > w.balancePaise; }

  constructor() {
    this.api.wallet().subscribe({ next: w => this.wallet.set(w), error: () => {} });
    this.api.channels().subscribe(c => {
      this.ch.set(c);
      if (!this.smsTemplateId) this.smsTemplateId = c.smsTemplate ?? '';
      if (c.whatsappApi) this.loadTemplates();
    });
    this.api.smsTemplates().subscribe({ next: t => this.smsList.set(t), error: () => {} });
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
    if (c === 'whatsapp') return s.whatsappApi ? (s.whatsappProvider === 'msg91' ? 'Connected via MSG91 (automatic)' : 'Connected (automatic)') : 'Manual mode (API not connected)';
    return (c === 'email' ? s.email : s.sms) ? 'Connected' : 'Not connected';
  }
  pickChannel(c: ChannelKey) { this.channel = c; this.error.set(''); }

  // ---------- WhatsApp template ----------
  loadTemplates() {
    this.templatesLoading.set(true);
    this.api.whatsappTemplates().subscribe({
      next: r => {
        this.templates.set(r.templates ?? []);
        this.templatesAvailable.set(!!r.available);
        this.templatesNote.set(r.available ? (r.templates?.length ? '' : 'No approved templates found in MSG91 yet.') : r.message ?? '');
        this.templatesLoaded.set(true);
        this.templatesLoading.set(false);
      },
      error: e => {
        this.templates.set([]);
        this.templatesAvailable.set(false);
        this.templatesNote.set(errMsg(e, "Couldn't load the templates") + '. Type the name and paste the text instead.');
        this.templatesLoaded.set(true);
        this.templatesLoading.set(false);
      },
    });
  }

  /** "kn" → "Kannada" for the dropdown. */
  langName(code: string): string {
    const names: Record<string, string> = { en: 'English', en_us: 'English (US)', en_gb: 'English (UK)', kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', mr: 'Marathi' };
    return names[(code ?? '').toLowerCase()] ?? code;
  }

  /** Text came from MSG91's list, so it's the approved wording and is shown read-only. */
  fromList(): boolean { return this.templates().some(t => t.name === this.templateName && t.language === this.templateLang) && !!this.templateBody; }

  /** Picked from the list: fills name, language and text, and suggests name/voucher for {{1}}/{{2}}. */
  chooseTemplate(key: string) {
    const t = this.templates().find(x => x.name + '|' + x.language === key);
    if (!t) { this.templateName = ''; this.templateBody = ''; this.templateParams = []; this.templateHeader = ''; return; }
    this.templateName = t.name;
    this.templateLang = t.language || 'en';
    this.templateBody = t.body ?? '';
    this.templateHeader = (t.header ?? '').toUpperCase();
    if (this.templateHeader !== 'IMAGE') this.photo.set(null);
    this.templateParams = [];
    this.syncParams();
  }

  // ---------- photo at the top (templates with an IMAGE header) ----------
  /** The chosen template's header type; 'IMAGE' means every message needs a photo. */
  templateHeader = '';
  readonly photo = signal<{ url: string; name: string } | null>(null);
  readonly uploadingPhoto = signal(false);
  readonly photoError = signal('');

  needsPhoto(): boolean { return this.templateMode() && this.templateHeader === 'IMAGE'; }

  /** WhatsApp header photos: JPG or PNG, up to 5 MB. Uploaded to the server, which gives a public link. */
  pickPhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoError.set('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) { this.photoError.set('WhatsApp accepts JPG or PNG photos only.'); return; }
    if (file.size > 5 * 1024 * 1024) { this.photoError.set('The photo is larger than 5 MB (WhatsApp\'s limit); use a smaller one.'); return; }
    this.uploadingPhoto.set(true);
    this.api.uploadHeaderImage(file).subscribe({
      next: r => { this.uploadingPhoto.set(false); this.photo.set({ url: r.url, name: file.name }); },
      error: err => { this.uploadingPhoto.set(false); this.photoError.set(errMsg(err, "Couldn't upload the photo")); },
    });
  }
  removePhoto() { this.photo.set(null); }
  templateKey() { return this.templateName ? this.templateName + '|' + this.templateLang : ''; }

  /** How many {{n}} the template text has. */
  varCount(): number { return templateVariables(this.templateBody); }
  varSlots(): number[] { return Array.from({ length: this.varCount() }, (_, i) => i); }

  /** One value per {{n}}: {{1}} = name and {{2}} = voucher by default, the rest typed by the admin. */
  syncParams() {
    const n = this.varCount();
    const p = this.templateParams.slice(0, n);
    while (p.length < n) p.push(p.length === 0 ? '{name}' : p.length === 1 && this.voucherOn ? '{voucher}' : '');
    this.templateParams = p;
  }
  setParam(i: number, v: string) { const p = [...this.templateParams]; p[i] = v; this.templateParams = p; }
  tplVar(i: number) { return '{{' + (i + 1) + '}}'; }

  /** WhatsApp through the API with a template: the wording is fixed by WhatsApp, only the {{n}} values change. */
  templateMode(): boolean {
    return this.channel === 'whatsapp' && !!this.ch()?.whatsappApi && !this.manual && !!this.templateName.trim();
  }

  // ---------- SMS (DLT template saved in MSG91) ----------
  /** MSG91 SMS template ID; pre-filled from the server's default. */
  smsTemplateId = '';
  /** Templates saved in Settings → SMS templates. */
  readonly smsList = signal<SmsTemplate[]>([]);
  /** Picked saved template: null = none yet, 0 = "Other" (type the ID and text by hand). */
  readonly smsPick = signal<number | null>(null);

  smsFromList(): boolean { return !!this.smsPick(); }

  /** Picking a saved template fills its MSG91 ID and approved text (read-only); its blanks start empty. */
  pickSms(id: number | null) {
    this.smsPick.set(id);
    this.smsVars = {};
    const t = this.smsList().find(x => x.id === id);
    if (t) { this.smsTemplateId = t.templateId; this.message = t.text; }
    else if (id === 0) { this.smsTemplateId = this.ch()?.smsTemplate ?? ''; this.message = ''; }
  }
  /** Values for the SMS text's ##variables## (the same for everyone; may contain {name} / {voucher}). */
  smsVars: Record<string, string> = {};

  /** The ##variables## in the pasted SMS text, in order. */
  smsVarNames(): string[] { return smsVariables(this.message); }
  /** ##name## and ##voucher## fill themselves for each person. */
  smsAuto(k: string): boolean { return /^(name|voucher)$/i.test(k); }
  smsTyped(): string[] { return this.smsVarNames().filter(k => !this.smsAuto(k)); }
  setSmsVar(k: string, v: string) { this.smsVars = { ...this.smsVars, [k]: v }; }
  smsTok(k: string) { return '##' + k + '##'; }

  private smsPreview(): string {
    const values: Record<string, string> = {};
    for (const k of this.smsVarNames()) {
      const v = this.smsVars[k]?.trim() || (/^name$/i.test(k) ? '{name}' : /^voucher$/i.test(k) ? '{voucher}' : '');
      values[k] = personalise(v, this.firstName(), this.sampleVoucher()) || '…';
    }
    return fillSms(this.message, values);
  }

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

  preview() {
    if (this.templateMode() && this.templateBody.trim()) {
      const values = this.templateParams.map(v => personalise(v, this.firstName(), this.sampleVoucher()) || '…');
      return fillTemplate(this.templateBody, values);
    }
    if (this.templateMode()) return '[template ' + this.templateName.trim() + '] — paste its text above to see the full message';
    if (this.channel === 'sms' && this.smsVarNames().length) return this.smsPreview();
    return personalise(this.message, this.firstName(), this.sampleVoucher());
  }
  previewSubject() { return personalise(this.subject, this.firstName(), this.sampleVoucher()); }

  // ---------- send ----------
  body(): Record<string, unknown> {
    const b: Record<string, unknown> = {
      name: this.name, channel: this.channel, subject: this.subject, message: this.message,
      template: this.channel === 'whatsapp' && !this.manual ? this.templateName : this.channel === 'sms' ? this.smsTemplateId.trim() : '',
      templateLang: this.templateLang,
      smsVars: this.channel === 'sms' ? Object.fromEntries(this.smsVarNames().map(k => [k, this.smsVars[k] ?? ''])) : {},
      templateBody: this.templateMode() ? this.templateBody : '',
      templateParams: this.templateMode() && this.templateBody.trim() ? this.templateParams : [],
      templateHeader: this.templateMode() ? this.templateHeader : '',
      headerImage: this.needsPhoto() ? this.photo()?.url ?? '' : '',
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
    if (this.needsPhoto() && !this.photo()) { this.error.set('This template shows a photo at the top: upload the photo first.'); return; }
    if (this.templateMode() && this.templateBody.trim()) {
      const missing = this.templateParams.findIndex(v => !v.trim());
      if (missing >= 0) { this.error.set('Fill in ' + this.tplVar(missing) + ' of the template.'); return; }
    }
    if (this.channel === 'sms') {
      if (this.smsList().length && this.smsPick() === null) { this.error.set('Choose an SMS template from the list.'); return; }
      if (!this.smsTemplateId.trim()) { this.error.set('Enter the MSG91 SMS template ID (MSG91 → SMS → Templates).'); return; }
      if (!this.message.trim()) { this.error.set('Paste the approved SMS text exactly as in MSG91.'); return; }
      const empty = this.smsTyped().find(k => !this.smsVars[k]?.trim());
      if (empty) { this.error.set('Fill in ' + this.smsTok(empty) + ' of the SMS.'); return; }
    }
    if (this.short()) {
      this.error.set(`Not enough balance: this send costs ${rupees(this.costPaise())} and the wallet has ${rupees(this.wallet()!.balancePaise)}. Ask Vincent Thrives to recharge.`);
      return;
    }
    if (this.estimate() > this.max()) { this.error.set(`That's more than ${this.max()} people. Split the list into smaller sends.`); return; }
    const via = { whatsapp: 'WhatsApp', email: 'email', sms: 'SMS' }[this.channel];
    const ok = await this.confirmer.ask({
      title: `Send to ${this.estimate()} people?`, detail: this.name, icon: 'send', confirmText: 'Send now',
      message: `This goes out by ${via}${this.voucherOn ? ', each with their own entrance voucher' : ''}. Messages that have been sent can't be taken back.`
        + (this.paid() ? ` ${rupees(this.costPaise())} will be taken from the wallet now; anything that fails is refunded.` : ''),
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.createCampaign(this.body()).subscribe({
      next: v => { this.busy.set(false); this.router.navigate(['/admin/messages', v.campaign.id]); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }
}

/** Highest {{n}} in a WhatsApp template text. */
export function templateVariables(body: string): number {
  let max = 0;
  for (const m of (body ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

/** Puts the values into {{1}}, {{2}}… (same as the server). */
export function fillTemplate(body: string, values: string[]): string {
  let out = body ?? '';
  values.forEach((v, i) => { out = out.replaceAll('{{' + (i + 1) + '}}', v); });
  return out;
}

/** The ##variables## of an MSG91 SMS template text, in order, without repeats. */
export function smsVariables(text: string): string[] {
  const out: string[] = [];
  for (const m of (text ?? '').matchAll(/##([A-Za-z0-9_]+)##/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Puts the values into the SMS text's ##variables## (same as the server). */
export function fillSms(text: string, values: Record<string, string>): string {
  let out = text ?? '';
  for (const [k, v] of Object.entries(values)) out = out.replaceAll('##' + k + '##', v);
  return out;
}

/** Same rules as the server: fills {name}/{voucher} and tidies the gap a blank name leaves. */
export function personalise(msg: string, name: string, voucher: string): string {
  return (msg ?? '').replaceAll('{name}', (name ?? '').trim()).replaceAll('{voucher}', voucher ?? '')
    .replace(/[ \t]{2,}/g, ' ').replaceAll(' ,', ',').trim();
}
