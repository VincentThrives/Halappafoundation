import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { WalletInfo, WalletLogQuery, WalletTxn, rupees } from '../core/models';
import { WalletLogComponent } from './wallet-log.component';

/** An admin's wallet: balance, prices per message, and their own audit log. Recharges come from the super admin. */
@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [FormsModule, IconComponent, WalletLogComponent],
  templateUrl: './wallet.component.html',
  styleUrls: ['./admin.scss', './wallet.component.scss'],
})
export class WalletComponent {
  private api = inject(AdminApi);
  readonly rupees = rupees;
  readonly info = signal<WalletInfo | null>(null);
  readonly items = signal<WalletTxn[]>([]);
  readonly total = signal(0);
  page = 0;
  f: WalletLogQuery = { type: '', from: '', to: '' };

  constructor() { this.refresh(); }

  refresh() {
    this.api.wallet().subscribe(w => this.info.set(w));
    this.load(0);
  }

  load(p: number) {
    this.page = p;
    this.api.walletLog(this.f, p).subscribe(r => { this.items.set(r.items); this.total.set(r.total); });
  }

  pages() { return Math.max(1, Math.ceil(this.total() / 50)); }
}
