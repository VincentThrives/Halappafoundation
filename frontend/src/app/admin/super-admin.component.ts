import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { ConfirmService } from '../core/confirm.service';
import { errMsg } from '../core/auth.service';
import { WalletAdmin, WalletLogQuery, WalletTxn, rupees } from '../core/models';
import { WalletLogComponent } from './wallet-log.component';

/** Super admin: recharge (or correct) each admin's wallet, set the price per message, and read everyone's audit log. */
@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [FormsModule, IconComponent, WalletLogComponent],
  templateUrl: './super-admin.component.html',
  styleUrls: ['./admin.scss', './super-admin.component.scss'],
})
export class SuperAdminComponent {
  private api = inject(AdminApi);
  private confirmer = inject(ConfirmService);
  readonly rupees = rupees;

  // wallets
  readonly admins = signal<WalletAdmin[]>([]);
  /** Admin whose money form is open, and what it does. */
  readonly editing = signal<{ username: string; mode: 'recharge' | 'deduct' | 'password' } | null>(null);
  amount = '';
  note = '';
  newPassword = '';
  showPw = false;
  readonly busy = signal(false);

  // prices (rupees, as typed)
  rates = { whatsapp: '0', sms: '0', email: '0' };
  readonly ratesInfo = signal('');

  // audit log
  readonly items = signal<WalletTxn[]>([]);
  readonly total = signal(0);
  page = 0;
  f: WalletLogQuery = { admin: '', type: '', from: '', to: '' };

  readonly toast = signal('');
  toastErr = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.loadAdmins();
    this.loadRates();
    this.load(0);
  }

  walletAdmins() { return this.admins().filter(a => a.role !== 'SUPER_ADMIN'); }

  loadAdmins() { this.api.superAdmins().subscribe(a => this.admins.set(a)); }

  loadRates() {
    this.api.superRates().subscribe(r => {
      const rs = (p: number) => (p / 100).toFixed(2);
      this.rates = { whatsapp: rs(r.whatsappPaise), sms: rs(r.smsPaise), email: rs(r.emailPaise) };
      this.ratesInfo.set(r.updatedAt ? `Last changed by ${r.updatedBy}.` : 'Not set yet: messages are free until you set a price.');
    });
  }

  load(p: number) {
    this.page = p;
    this.api.audit(this.f, p).subscribe(r => { this.items.set(r.items); this.total.set(r.total); });
  }
  pages() { return Math.max(1, Math.ceil(this.total() / 50)); }

  open(username: string, mode: 'recharge' | 'deduct' | 'password') {
    this.editing.set({ username, mode });
    this.amount = '';
    this.note = '';
    this.newPassword = '';
    this.showPw = false;
  }
  close() { this.editing.set(null); }

  /** Typed rupees → paise for the confirmation (server re-checks everything). */
  private paise(v: string): number | null {
    const s = (v ?? '').replace(/[₹,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const p = Math.round(Number(s) * 100);
    return p > 0 ? p : null;
  }

  async saveMoney() {
    const e = this.editing();
    if (!e) return;
    const p = this.paise(this.amount);
    if (p === null) { this.say('Enter an amount in rupees, e.g. 500 or 0.80', true); return; }
    const a = this.admins().find(x => x.username === e.username);
    const after = (a?.walletPaise ?? 0) + (e.mode === 'recharge' ? p : -p);
    const ok = await this.confirmer.ask({
      title: e.mode === 'recharge' ? `Add ${rupees(p)} to ${e.username}'s wallet?` : `Take ${rupees(p)} from ${e.username}'s wallet?`,
      detail: `Balance after: ${rupees(after)}`, icon: e.mode === 'recharge' ? 'plus' : 'close', danger: e.mode === 'deduct',
      confirmText: e.mode === 'recharge' ? 'Recharge' : 'Deduct', message: this.note ? `Note: ${this.note}` : 'This is recorded in the audit log.',
    });
    if (!ok) return;
    this.busy.set(true);
    const call = e.mode === 'recharge' ? this.api.recharge(e.username, this.amount, this.note) : this.api.deduct(e.username, this.amount, this.note);
    call.subscribe({
      next: t => {
        this.busy.set(false);
        this.say(`${e.mode === 'recharge' ? 'Recharged' : 'Deducted'} ${rupees(Math.abs(t.amountPaise))}. ${e.username} now has ${rupees(t.balanceAfterPaise)}.`);
        this.close();
        this.loadAdmins();
        this.load(0);
      },
      error: err => { this.busy.set(false); this.say(errMsg(err), true); },
    });
  }

  /** New password for an admin who forgot theirs; the old one isn't needed. */
  async savePassword() {
    const e = this.editing();
    if (!e) return;
    const pw = this.newPassword;
    if (pw.length < 8 || pw.length > 100) { this.say('Password must be 8 to 100 characters', true); return; }
    const ok = await this.confirmer.ask({
      title: `Set a new password for ${e.username}?`, icon: 'settings', confirmText: 'Set password',
      message: 'The old password stops working right away. Tell the admin the new one.',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.setAdminPassword(e.username, pw).subscribe({
      next: () => { this.busy.set(false); this.say(`New password set for ${e.username}.`); this.close(); },
      error: err => { this.busy.set(false); this.say(errMsg(err), true); },
    });
  }

  saveRates() {
    this.busy.set(true);
    this.api.setRates(this.rates).subscribe({
      next: () => { this.busy.set(false); this.say('Prices saved. New sends use them right away.'); this.loadRates(); this.load(0); },
      error: err => { this.busy.set(false); this.say(errMsg(err), true); },
    });
  }

  private say(m: string, err = false) {
    this.toastErr = err;
    this.toast.set(m);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}
