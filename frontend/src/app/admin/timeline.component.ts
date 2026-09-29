import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { TimelineEntry } from '../core/models';

type Draft = Omit<Partial<TimelineEntry>, 'id'> & { id: number | null };

@Component({
  selector: 'app-admin-timeline',
  standalone: true,
  imports: [FormsModule, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>Timeline</h1><p>Milestones shown on the Timeline page, in order.</p></div>
      <button class="btn btn-maroon btn-sm" (click)="edit()"><app-icon name="plus" /> Add milestone</button>
    </div>
    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th>Order</th><th>Period</th><th>Title</th><th></th></tr></thead>
          <tbody>
            @for (t of items(); track t.id) {
              <tr class="row">
                <td>{{ t.sortOrder }}</td><td>{{ t.period }}</td>
                <td><b>{{ t.titleEn }}</b>@if (t.titleKn) {<br><span class="muted">{{ t.titleKn }}</span>}</td>
                <td class="nowrap">
                  <button class="icon-btn" (click)="edit(t)" title="Edit"><app-icon name="edit" /></button>
                  <button class="icon-btn danger" (click)="remove(t)" title="Delete"><app-icon name="trash" /></button>
                </td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">No milestones yet.</td></tr> }
          </tbody>
        </table>
      </div>
    </div>

    @if (draft(); as d) {
      <div class="modal-bg">
        <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="d.id ? 'Edit milestone' : 'New milestone'">
          <div class="modal-head">
            <h2>{{ d.id ? 'Edit milestone' : 'New milestone' }}</h2>
            <button class="modal-x" (click)="draft.set(null)" aria-label="Close"><app-icon name="close" /></button>
          </div>
          <div class="modal-body stack">
            <div class="grid2">
              <div class="field"><label>Period (e.g. 2015, 2010–2014, Present)</label><input class="input" [(ngModel)]="d.period"></div>
              <div class="field"><label>Order (smaller shows first)</label><input class="input" type="number" [(ngModel)]="d.sortOrder"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Title <span class="lang-tag">EN</span> *</label><input class="input" [(ngModel)]="d.titleEn"></div>
              <div class="field"><label>Title <span class="lang-tag">ಕನ್ನಡ</span></label><input class="input" [(ngModel)]="d.titleKn"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Description <span class="lang-tag">EN</span></label><textarea class="input" rows="4" [(ngModel)]="d.descEn"></textarea></div>
              <div class="field"><label>Description <span class="lang-tag">ಕನ್ನಡ</span></label><textarea class="input" rows="4" [(ngModel)]="d.descKn"></textarea></div>
            </div>
          </div>
          <div class="modal-foot">
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn-ghost" (click)="draft.set(null)">Cancel</button>
            <button class="btn btn-maroon" (click)="save(d)"><app-icon name="check" /> {{ d.id ? 'Save changes' : 'Add milestone' }}</button>
          </div>
        </div>
      </div>
    }
    @if (toast()) { <div class="toast" [class.err]="toastErr">{{ toast() }}</div> }
  `,
  styles: [`.nowrap { white-space: nowrap; } .err { color: var(--m-500); margin: 0; }`],
})
export class AdminTimelineComponent {
  private api = inject(AdminApi);
  private confirm = inject(ConfirmService);
  readonly items = signal<TimelineEntry[]>([]);
  readonly draft = signal<Draft | null>(null);
  readonly error = signal('');

  constructor() { this.load(); }
  load() { this.api.timeline().subscribe(t => this.items.set(t)); }

  edit(t?: TimelineEntry) {
    this.error.set('');
    const next = (this.items().at(-1)?.sortOrder ?? -1) + 1;
    this.draft.set(t ? { ...t } : { id: null, period: '', titleEn: '', titleKn: '', descEn: '', descKn: '', sortOrder: next });
  }

  save(d: Draft) {
    if (!d.titleEn?.trim()) { this.error.set('English title is required'); return; }
    const { id, ...body } = d;
    this.api.saveTimeline(id, body).subscribe({
      next: () => { this.draft.set(null); this.say(id ? 'Changes saved' : 'Milestone added'); this.load(); },
      error: e => this.error.set(errMsg(e)),
    });
  }

  @HostListener('document:keydown.escape')
  esc() { this.draft.set(null); }

  async remove(t: TimelineEntry) {
    const ok = await this.confirm.ask({
      title: 'Delete this milestone?', detail: t.titleEn, danger: true,
      message: 'It will be removed from the Timeline page. This cannot be undone.',
    });
    if (!ok) return;
    this.api.deleteTimeline(t.id).subscribe({
      next: () => { this.say('Milestone deleted'); this.load(); },
      error: e => this.say(errMsg(e, 'Could not delete'), true),
    });
  }

  readonly toast = signal('');
  toastErr = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Shows a message; a newer message restarts the timer instead of being cut short by the older one. */
  private say(m: string, err = false) {
    this.toastErr = err;
    this.toast.set(m);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }
}
