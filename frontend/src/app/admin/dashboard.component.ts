import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./admin.scss', './dashboard.component.scss'],
})
export class DashboardComponent {
  readonly d = signal<any>(null);
  constructor() { inject(AdminApi).dashboard().subscribe(d => this.d.set(d)); }
}
