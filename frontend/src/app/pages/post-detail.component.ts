import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, Location } from '@angular/common';
import { LangService, LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, paragraphs } from '../core/motion';
import { Post } from '../core/models';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [RouterLink, TPipe, LocPipe, DatePipe, IconComponent, RevealDirective],
  template: `
  <section class="page-banner">
    <div class="container">
      @if (post(); as p) {
        <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ 'cat.' + p.category | t }}</div>
        <h1>{{ p | loc: 'title' }}</h1>
        <p class="lead">
          @if (p.author) { {{ 'list.by' | t }} {{ p.author }} · }
          {{ p.publishedOn | date: 'longDate' }}
        </p>
      } @else {
        <h1>&nbsp;</h1>
      }
    </div>
  </section>

  <section class="section">
    <article class="container reader">
      @if (post(); as p) {
        @if (p.image) { <img class="hero-img" [src]="p.image" alt="" appReveal="zoom"> }
        @for (para of body(); track $index) { <p appReveal="up">{{ para }}</p> }
        <div class="actions">
          <button class="btn btn-maroon btn-sm" (click)="back()"><app-icon name="arrow" class="flip" /> {{ 'list.back' | t }}</button>
          @if (p.sourceUrl) {
            <a class="btn btn-sm" [href]="p.sourceUrl" target="_blank" rel="noopener">{{ 'list.source' | t }} <app-icon name="external" /></a>
          }
        </div>
      } @else if (missing()) {
        <div class="empty">{{ 'notfound' | t }}</div>
      } @else {
        <div class="skeleton" style="height: 320px"></div>
      }
    </article>
  </section>
  `,
  styles: [`
    .reader { max-width: 820px; }
    .hero-img { width: 100%; border-radius: 22px; margin-bottom: 40px; box-shadow: var(--shadow); max-height: 520px; object-fit: cover; }
    .reader p { font-size: 1.12rem; line-height: 1.9; color: #3b2a22; }
    .reader p:first-of-type::first-letter { float: left; font-family: 'Playfair Display', serif; font-size: 4.2rem; line-height: .9; padding: 6px 12px 0 0; color: var(--m-700); }
    :host-context(html.lang-kn) .reader p:first-of-type::first-letter { float: none; font-size: inherit; padding: 0; color: inherit; }
    .actions { display: flex; gap: 12px; margin-top: 40px; padding-top: 30px; border-top: 1px solid var(--line); flex-wrap: wrap; }
    .flip { transform: rotate(180deg); }
  `],
})
export class PostDetailComponent {
  private api = inject(ApiService);
  private lang = inject(LangService);
  private location = inject(Location);
  readonly post = signal<Post | null>(null);
  readonly missing = signal(false);
  readonly body = computed(() => paragraphs(this.lang.pick(this.post(), 'body')));

  constructor() {
    inject(ActivatedRoute).paramMap.subscribe(p => {
      this.post.set(null);
      this.api.post(Number(p.get('id'))).subscribe({ next: x => this.post.set(x), error: () => this.missing.set(true) });
    });
  }

  back() { this.location.back(); }
}
