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
  template: `
  <section class="page-banner">
    <div class="container">
      <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ 'nav.timeline' | t }}</div>
      <h1>{{ 'nav.timeline' | t }}</h1>
      <p class="lead">{{ 'timeline.lead' | t }}</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      @if (items() === null) {
        <div class="skeleton" style="height: 400px"></div>
      } @else if (!items()!.length) {
        <div class="empty"><img src="img/logo.jpg" alt="">{{ 'list.empty' | t }}</div>
      } @else {
        <ol class="tl">
          @for (e of items(); track e.id; let i = $index) {
            <li [class.right]="i % 2 === 1">
              <div class="dot" appReveal="zoom"></div>
              <div class="card" [appReveal]="i % 2 ? 'right' : 'left'">
                @if (e.period) { <span class="period">{{ period(e.period) }}</span> }
                <h3>{{ e | loc: 'title' }}</h3>
                @if (e | loc: 'desc') { <p>{{ e | loc: 'desc' }}</p> }
              </div>
            </li>
          }
        </ol>
      }
    </div>
  </section>
  `,
  styles: [`
    .tl { list-style: none; margin: 0 auto; padding: 0; position: relative; max-width: 1000px; }
    .tl::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; background: linear-gradient(var(--g-500), var(--m-700)); border-radius: 3px; }
    .tl li { position: relative; width: 50%; padding: 0 50px 50px 0; }
    .tl li.right { margin-left: 50%; padding: 0 0 50px 50px; }
    .dot { position: absolute; top: 18px; right: -13px; width: 26px; height: 26px; border-radius: 50%; background: var(--gold-grad); border: 5px solid var(--cream); box-shadow: 0 0 0 3px var(--m-700); z-index: 1; }
    .tl li.right .dot { right: auto; left: -13px; }
    .card { background: #fff; border-radius: 18px; padding: 26px 28px; border: 1px solid var(--line); box-shadow: 0 16px 40px -28px rgba(58,3,8,.5); position: relative; transition: transform .4s var(--ease); }
    .card:hover { transform: translateY(-6px); }
    .card::after { content: ''; position: absolute; top: 22px; right: -9px; width: 16px; height: 16px; background: #fff; border-top: 1px solid var(--line); border-right: 1px solid var(--line); transform: rotate(45deg); }
    .tl li.right .card::after { right: auto; left: -9px; transform: rotate(-135deg); }
    .period { display: inline-block; background: var(--maroon-grad); color: var(--g-300); font-weight: 600; font-size: .78rem; letter-spacing: .1em; text-transform: uppercase; padding: 5px 14px; border-radius: 999px; margin-bottom: 12px; }
    .card h3 { font-size: 1.3rem; margin-bottom: 6px; }
    .card p { margin: 0; color: var(--muted); }
    @media (max-width: 760px) {
      .tl::before { left: 14px; }
      .tl li, .tl li.right { width: 100%; margin-left: 0; padding: 0 0 36px 50px; }
      .dot, .tl li.right .dot { left: 1px; right: auto; }
      .card::after, .tl li.right .card::after { left: -9px; right: auto; transform: rotate(-135deg); }
    }
  `],
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
