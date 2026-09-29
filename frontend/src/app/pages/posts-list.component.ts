import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { DatePipe } from '@angular/common';
import { combineLatest } from 'rxjs';
import { LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { MENU } from '../core/i18n';
import { RevealDirective } from '../core/motion';
import { IconComponent } from '../core/icon.component';
import { Post } from '../core/models';

/** One component for Press/*, My Views/* and Stalwart Says (route data picks the section). */
@Component({
  selector: 'app-posts-list',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe, LocPipe, DatePipe, RevealDirective, IconComponent],
  template: `
  <section class="page-banner">
    <div class="container">
      <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ sectionTitle() | t }}</div>
      <h1>{{ (category() && section() !== 'stalwart' ? 'cat.' + category() : sectionTitle()) | t }}</h1>
      <p class="lead">{{ lead() | t }}</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      @if (tabs().length) {
        <nav class="tabs">
          @for (c of tabs(); track c) {
            <a [routerLink]="[base(), c]" routerLinkActive="active">{{ 'cat.' + c | t }}</a>
          }
        </nav>
      }

      @if (items() === null) {
        <div class="card-grid list-mode">@for (n of [1, 2, 3]; track n) { <div class="skeleton" style="height: 120px"></div> }</div>
      } @else if (!items()!.length) {
        <div class="empty" appReveal="zoom"><img src="img/logo.jpg" alt="">{{ 'list.empty' | t }}</div>
      } @else if (isQuoteStyle()) {
        <div class="quotes">
          @for (p of items(); track p.id; let i = $index) {
            <a class="q-card" [routerLink]="['/post', p.id]" appReveal="up" [delay]="(i % 2) * 120">
              <app-icon name="quote" class="qm" />
              <p class="q-text">{{ (p | loc: 'body') || (p | loc: 'title') }}</p>
              <div class="q-by">
                @if (p.image) { <img [src]="p.image" alt=""> }
                <span><b>{{ p.author || ('brand.person' | t) }}</b>
                @if (section() === 'stalwart') { <small>{{ p | loc: 'title' }}</small> }</span>
              </div>
            </a>
          }
        </div>
      } @else {
        <div class="card-grid list-mode">
          @for (p of items(); track p.id; let i = $index) {
            <a class="post-card" [routerLink]="['/post', p.id]" appReveal="up" [delay]="(i % 3) * 120">
              <div class="thumb">
                @if (p.image) { <img [src]="p.image" alt="" loading="lazy"> }
                @else { <div class="ph"><img src="img/logo.jpg" alt=""></div> }
              </div>
              <div class="body">
                <span class="meta">{{ 'cat.' + p.category | t }} · {{ p.publishedOn | date: 'mediumDate' }}</span>
                <h3>{{ p | loc: 'title' }}</h3>
                <p>{{ p | loc: 'body' }}</p>
                <span class="more">{{ 'list.readMore' | t }}</span>
              </div>
            </a>
          }
        </div>
      }

      @if (items() && items()!.length < total()) {
        <div class="more-wrap"><button class="btn btn-maroon" (click)="loadMore()">{{ 'list.loadMore' | t }}</button></div>
      }
    </div>
  </section>
  `,
  styles: [`
    .quotes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; }
    .q-card { position: relative; display: flex; flex-direction: column; gap: 18px; padding: 44px 40px 32px; border-radius: 22px; background: #fff; border: 1px solid var(--line); text-decoration: none; color: inherit; overflow: hidden; transition: transform .5s var(--ease), box-shadow .5s var(--ease); }
    .q-card::after { content: ''; position: absolute; left: 0; bottom: 0; height: 4px; width: 100%; background: var(--gold-grad); transform: scaleX(0); transform-origin: left; transition: transform .6s var(--ease); }
    .q-card:hover { transform: translateY(-8px); box-shadow: var(--shadow); }
    .q-card:hover::after { transform: scaleX(1); }
    .qm { width: 46px; height: 46px; color: var(--g-500); }
    .q-text { font-family: var(--font-head); font-size: 1.35rem; line-height: 1.55; color: var(--m-900); margin: 0; }
    .q-by { display: flex; align-items: center; gap: 12px; margin-top: auto; }
    .q-by img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid var(--g-500); }
    .q-by b { display: block; color: var(--m-700); }
    .q-by small { color: var(--muted); }
    .more-wrap { text-align: center; margin-top: 50px; }
    @media (max-width: 800px) { .quotes { grid-template-columns: 1fr; } .q-card { padding: 32px 26px; } }
  `],
})
export class PostsListComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly section = signal<'press' | 'views' | 'stalwart'>('press');
  readonly category = signal<string>('');
  readonly items = signal<Post[] | null>(null);
  readonly total = signal(0);
  private page = 0;

  constructor() {
    combineLatest([this.route.data, this.route.paramMap]).subscribe(([d, p]) => {
      this.section.set(d['section']);
      this.category.set(d['section'] === 'stalwart' ? 'stalwart' : p.get('category') ?? '');
      this.page = 0;
      this.items.set(null);
      this.fetch();
    });
  }

  tabs(): string[] {
    return this.section() === 'press' ? MENU.press : this.section() === 'views' ? MENU.views : [];
  }
  base() { return this.section() === 'press' ? '/press' : '/my-views'; }
  sectionTitle() { return { press: 'nav.press', views: 'nav.views', stalwart: 'nav.stalwart' }[this.section()]; }
  lead() { return { press: 'press.lead', views: 'views.lead', stalwart: 'stalwart.lead' }[this.section()]; }
  isQuoteStyle() { return this.section() === 'stalwart' || this.category() === 'quotes'; }

  private fetch() {
    this.api.posts(this.section(), this.category(), this.page, 12).subscribe({
      next: r => { this.items.set([...(this.page ? this.items() ?? [] : []), ...r.items]); this.total.set(r.total); },
      error: () => this.items.set([]),
    });
  }

  loadMore() { this.page++; this.fetch(); }
}
