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
  styleUrl: './admin.scss',
  template: `
    <div class="head"><div><h1>Voucher check-in</h1><p>At the entrance: type or scan the voucher number and press Enter.</p></div></div>

    <div class="card scan">
      <input #box class="input big" [(ngModel)]="code" (keyup.enter)="find()" placeholder="KIT-2026-0001" autocomplete="off" autocapitalize="characters">
      <button class="btn btn-maroon" (click)="find()">Check</button>
    </div>

    @if (error()) { <div class="card result bad"><b>{{ error() }}</b></div> }

    @for (m of results(); track m.id) {
      <div class="card result" [class.ok]="!m.attendedAt" [class.warn]="!!m.attendedAt">
        <div class="who">
          <span class="vch">{{ m.voucher }}</span>
          <h2>{{ m.name || 'No name' }}</h2>
          <p>{{ m.contact }} · sent by {{ m.channel }} · {{ m.status }}</p>
        </div>
        @if (m.attendedAt) {
          <p class="already"><app-icon name="check" /> Already checked in at {{ m.attendedAt | date: 'dd MMM, h:mm a' }}</p>
        } @else {
          <button class="btn btn-wa" (click)="attend(m)"><app-icon name="check" /> Mark attended</button>
        }
      </div>
    }

    @if (recent().length) {
      <div class="card">
        <h2>Checked in just now</h2>
        <ul class="recent">
          @for (r of recent(); track r.id) { <li><span class="vch">{{ r.voucher }}</span> {{ r.name }} <small>{{ r.attendedAt | date: 'h:mm:ss a' }}</small></li> }
        </ul>
      </div>
    }
  `,
  styles: [`
    .scan { display: flex; gap: 10px; }
    .big { flex: 1; min-width: 0; font-size: 1.6rem; font-family: monospace; letter-spacing: .08em; text-transform: uppercase; padding: 14px 18px; }
    @media (max-width: 600px) { .big { font-size: 1.1rem; letter-spacing: .02em; padding: 12px; } }
    .result { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; border-left: 6px solid var(--line); }
    .result.ok { border-left-color: #1fb855; }
    .result.warn { border-left-color: var(--g-500); background: #fffaf0; }
    .result.bad { border-left-color: #b3261e; color: #b3261e; }
    .who h2 { margin: 6px 0 2px; font-size: 1.5rem; }
    .who p { margin: 0; color: var(--muted); }
    .vch { font-family: monospace; background: var(--g-300); color: var(--m-900); padding: 2px 8px; border-radius: 6px; font-weight: 700; }
    .already { color: #8a5a00; font-weight: 600; display: flex; gap: 6px; align-items: center; margin: 0; }
    .recent { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    .recent small { color: var(--muted); }
  `],
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
