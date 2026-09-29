import { Component, HostListener, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { RevealDirective } from '../core/motion';
import { GalleryItem } from '../core/models';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe, LocPipe, IconComponent, RevealDirective],
  template: `
  <section class="page-banner">
    <div class="container">
      <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ 'nav.gallery' | t }}</div>
      <h1>{{ (category() ? 'cat.' + category() : 'nav.gallery') | t }}</h1>
      <p class="lead">{{ 'gallery.lead' | t }}</p>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <nav class="tabs">
        <a routerLink="/gallery" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{ 'cat.all' | t }}</a>
        @for (c of cats; track c) { <a [routerLink]="['/gallery', c]" routerLinkActive="active">{{ 'cat.' + c | t }}</a> }
      </nav>

      @if (items() === null) {
        <div class="masonry">@for (n of [1, 2, 3, 4, 5, 6]; track n) { <div class="skeleton tile" [style.height.px]="200 + (n % 3) * 80"></div> }</div>
      } @else if (!items()!.length) {
        <div class="empty"><img src="img/logo.jpg" alt="">{{ 'list.empty' | t }}</div>
      } @else {
        <div class="masonry">
          @for (g of items(); track g.id; let i = $index) {
            <button class="tile" (click)="open(i)" appReveal="up" [delay]="(i % 4) * 90">
              <img [src]="g.image" [alt]="g | loc: 'caption'" loading="lazy">
              <span class="cap">
                <small>{{ 'cat.' + g.category | t }}</small>
                {{ g | loc: 'caption' }}
              </span>
            </button>
          }
        </div>
      }
    </div>
  </section>

  @if (lightbox() !== null && items(); as list) {
    <div class="lb" (click)="close()">
      <button class="lb-btn close" (click)="close()" aria-label="Close"><app-icon name="close" /></button>
      <button class="lb-btn prev" (click)="step(-1, $event)" aria-label="Previous"><app-icon name="arrow" /></button>
      <figure (click)="$event.stopPropagation()">
        @for (g of [list[lightbox()!]]; track g.id) {
          <img [src]="g.image" alt="">
          @if (g | loc: 'caption') { <figcaption>{{ g | loc: 'caption' }}</figcaption> }
        }
      </figure>
      <button class="lb-btn next" (click)="step(1, $event)" aria-label="Next"><app-icon name="arrow" /></button>
      <span class="count">{{ lightbox()! + 1 }} / {{ list.length }}</span>
    </div>
  }
  `,
  styles: [`
    .masonry { columns: 4 260px; column-gap: 18px; }
    .tile { display: block; width: 100%; margin: 0 0 18px; break-inside: avoid; border: 0; padding: 0; cursor: zoom-in; position: relative; border-radius: 16px; overflow: hidden; background: var(--cream-2); }
    .tile img { width: 100%; transition: transform 1.2s var(--ease), filter .6s; }
    .tile:hover img { transform: scale(1.08); filter: saturate(1.15); }
    .cap { position: absolute; inset: auto 0 0; padding: 50px 18px 16px; text-align: left; color: #fff; font-weight: 500; background: linear-gradient(transparent, rgba(36,2,5,.92)); opacity: 0; transform: translateY(20px); transition: all .5s var(--ease); }
    .cap small { display: block; color: var(--g-400); font-size: .72rem; text-transform: uppercase; letter-spacing: .12em; }
    .tile:hover .cap, .tile:focus-visible .cap { opacity: 1; transform: none; }
    .tile::after { content: ''; position: absolute; inset: 10px; border: 1.5px solid rgba(245,210,122,.8); border-radius: 10px; opacity: 0; transform: scale(1.06); transition: all .5s var(--ease); pointer-events: none; }
    .tile:hover::after { opacity: 1; transform: none; }

    .lb { position: fixed; inset: 0; z-index: 500; background: rgba(20,1,3,.94); display: grid; place-items: center; animation: fade .35s ease both; }
    @keyframes fade { from { opacity: 0; } }
    figure { margin: 0; max-width: min(1100px, 92vw); max-height: 86vh; text-align: center; animation: pop .5s var(--ease) both; }
    @keyframes pop { from { transform: scale(.9); opacity: 0; } }
    figure img { max-width: 100%; max-height: 78vh; border-radius: 12px; box-shadow: 0 30px 80px rgba(0,0,0,.6); margin: 0 auto; }
    figcaption { color: var(--g-300); margin-top: 14px; }
    .lb-btn { position: absolute; width: 54px; height: 54px; border-radius: 50%; border: 1.5px solid rgba(245,210,122,.5); background: rgba(0,0,0,.3); color: var(--g-300); cursor: pointer; display: grid; place-items: center; transition: all .3s; }
    .lb-btn:hover { background: var(--gold-grad); color: var(--m-900); }
    .close { top: 24px; right: 24px; }
    .prev { left: 24px; top: 50%; transform: translateY(-50%) rotate(180deg); }
    .next { right: 24px; top: 50%; transform: translateY(-50%); }
    .count { position: absolute; bottom: 24px; color: rgba(255,255,255,.6); font-size: .9rem; letter-spacing: .1em; }
    @media (max-width: 640px) {
      .prev, .next { top: auto; bottom: 16px; transform: none; } .prev { transform: rotate(180deg); }
      /* Two photos across on phones, like a photo app. */
      .masonry { columns: 2; column-gap: 10px; }
      .tile { margin-bottom: 10px; border-radius: 12px; }
      .cap { opacity: 1; transform: none; padding: 26px 10px 8px; font-size: .78rem; }
      .cap small { font-size: .6rem; }
    }
  `],
})
export class GalleryComponent {
  private api = inject(ApiService);
  readonly cats = MENU.gallery;
  readonly category = signal('');
  readonly items = signal<GalleryItem[] | null>(null);
  readonly lightbox = signal<number | null>(null);

  constructor() {
    inject(ActivatedRoute).paramMap.subscribe(p => {
      this.category.set(p.get('category') ?? '');
      this.items.set(null);
      this.api.gallery(this.category() || undefined).subscribe({ next: g => this.items.set(g), error: () => this.items.set([]) });
    });
  }

  open(i: number) { this.lightbox.set(i); document.body.style.overflow = 'hidden'; }
  close() { this.lightbox.set(null); document.body.style.overflow = ''; }
  step(d: number, e?: Event) {
    e?.stopPropagation();
    const n = this.items()?.length ?? 0;
    if (n && this.lightbox() !== null) this.lightbox.set((this.lightbox()! + d + n) % n);
  }

  @HostListener('document:keydown', ['$event'])
  key(e: KeyboardEvent) {
    if (this.lightbox() === null) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowRight') this.step(1);
    if (e.key === 'ArrowLeft') this.step(-1);
  }
}
