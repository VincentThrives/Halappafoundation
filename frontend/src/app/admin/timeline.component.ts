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
  templateUrl: './timeline.component.html',
  styleUrls: ['./admin.scss', './timeline.component.scss'],
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
