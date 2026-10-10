import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { Message } from '../core/models';

/** Event-desk check-in: type or scan a voucher number, confirm the person, mark attended. */
@Component({
  selector: 'app-vouchers',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent],
  templateUrl: './vouchers.component.html',
  styleUrls: ['./admin.scss', './vouchers.component.scss'],
})
export class VouchersComponent implements AfterViewInit {
  private api = inject(AdminApi);
  @ViewChild('box') box?: ElementRef<HTMLInputElement>;
  code = '';
  readonly results = signal<Message[]>([]);
  readonly recent = signal<Message[]>([]);
  readonly error = signal('');

  ngAfterViewInit() { this.box?.nativeElement.focus(); }

  find() {
    const c = this.code.trim();
    this.error.set('');
    this.results.set([]);
    if (!c) return;
    this.api.findVoucher(c).subscribe({
      next: r => {
        if (!r.length) this.error.set(`No voucher "${c.toUpperCase()}" found.`);
        this.results.set(r);
      },
      error: e => this.error.set(errMsg(e)),
    });
  }

  attend(m: Message) {
    this.api.attend(m.id).subscribe({
      next: u => {
        this.results.set(this.results().map(x => (x.id === u.id ? u : x)));
        this.recent.set([u, ...this.recent()].slice(0, 20));
        this.code = '';
        this.box?.nativeElement.focus();
      },
      error: e => this.error.set(errMsg(e)),
    });
  }
}
