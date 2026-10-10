import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { CampaignView, Channels } from '../core/models';

const CH_ICON: Record<string, string> = { whatsapp: 'whatsapp', email: 'mail', sms: 'phone' };

/** List of all bulk sends + connection status of each channel. */
@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [RouterLink, DatePipe, IconComponent],
  templateUrl: './campaigns.component.html',
  styleUrls: ['./admin.scss', './campaigns.component.scss'],
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
