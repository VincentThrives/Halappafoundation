import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WalletTxn, rupees } from '../core/models';

/** The wallet audit log table (used on the Wallet page and the Super admin page). */
@Component({
  selector: 'app-wallet-log',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './wallet-log.component.html',
  styleUrl: './wallet-log.component.scss',
})
export class WalletLogComponent {
  readonly items = input.required<WalletTxn[]>();
  /** Show whose wallet each line belongs to (super admin view). */
  readonly showAdmin = input(false);

  readonly rupees = rupees;
  readonly labels: Record<string, string> = {
    RECHARGE: 'Recharge', DEDUCT: 'Deducted', SEND: 'Bulk send', REPLY: 'Inbox reply', REFUND: 'Refund', RATES: 'Prices changed',
  };
  readonly channels: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', web: 'WhatsApp' };

  /** "5 × ₹0.80" for message charges/refunds. */
  detail(t: WalletTxn): string {
    return t.messages ? `${t.messages} message${t.messages === 1 ? '' : 's'} × ${rupees(t.ratePaise)}` : '';
  }
}
