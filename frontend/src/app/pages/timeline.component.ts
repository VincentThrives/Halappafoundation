import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LangService, LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { RevealDirective } from '../core/motion';
import { TimelineEntry } from '../core/models';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [RouterLink, TPipe, LocPipe, RevealDirective],
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.scss',
})
export class TimelineComponent {
  private lang = inject(LangService);
  readonly items = signal<TimelineEntry[] | null>(null);

  /** Period is free text; translate the common labels, leave years as they are. */
  period(p: string): string {
    if (this.lang.lang() !== 'kn') return p;
    const map: Record<string, string> = { present: 'ಪ್ರಸ್ತುತ', past: 'ಹಿಂದಿನ', roots: 'ಬೇರುಗಳು', education: 'ಶಿಕ್ಷಣ' };
    return map[p.trim().toLowerCase()] ?? p.replace(/years?/i, 'ವರ್ಷಗಳು');
  }

  constructor() {
    inject(ApiService).timeline().subscribe({ next: t => this.items.set(t), error: () => this.items.set([]) });
  }
}
