import { Component, HostListener, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';
import { TPipe } from '../core/lang.service';

/** Mail / Facebook / WhatsApp / Instagram pinned to the right edge, mid-screen, on every public page. */
@Component({
  selector: 'app-social-float',
  standalone: true,
  imports: [IconComponent, AsyncPipe, TPipe, RouterLink],
  template: `
    @if (settings$ | async; as s) {
      <aside class="float" aria-label="Contact and social links">
        <a class="mail" [href]="'mailto:' + s['email']" style="--i:0"><app-icon name="mail" /><span>{{ 'social.mail' | t }}</span></a>
        @if (s['facebook']) {
          <a class="fb" [href]="s['facebook']" target="_blank" rel="noopener" style="--i:1"><app-icon name="facebook" /><span>{{ 'social.facebook' | t }}</span></a>
        } @else {
          <a class="fb" routerLink="/contact" style="--i:1"><app-icon name="facebook" /><span>{{ 'social.facebook' | t }}</span></a>
        }
        <a class="wa" [href]="'https://wa.me/' + s['whatsapp']" target="_blank" rel="noopener" style="--i:2"><app-icon name="whatsapp" /><span>{{ 'social.whatsapp' | t }}</span></a>
        @if (s['instagram']) {
          <a class="ig" [href]="s['instagram']" target="_blank" rel="noopener" style="--i:3"><app-icon name="instagram" /><span>{{ 'social.instagram' | t }}</span></a>
        } @else {
          <a class="ig" routerLink="/contact" style="--i:3"><app-icon name="instagram" /><span>{{ 'social.instagram' | t }}</span></a>
        }
        @if (s['youtube']) {
          <a class="yt" [href]="s['youtube']" target="_blank" rel="noopener" style="--i:4"><app-icon name="youtube" /><span>{{ 'social.youtube' | t }}</span></a>
        }
      </aside>
    }
    <button class="to-top" [class.show]="progress() > 0.08" (click)="top()" aria-label="Back to top"
            [style.--p]="progress()">
      <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" /></svg>
      <app-icon name="up" />
    </button>
  `,
  styles: [`
    .float {
      position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 90;
      display: flex; flex-direction: column; gap: 6px; view-transition-name: social-float;
    }
    .float a {
      --c: var(--m-700);
      position: relative; display: flex; align-items: center; justify-content: flex-end; gap: 10px;
      height: 50px; width: 50px; padding: 0 14px; border-radius: 14px 0 0 14px; overflow: hidden;
      color: #fff; background: var(--c); text-decoration: none; font-weight: 600; font-size: .9rem; white-space: nowrap;
      box-shadow: -6px 8px 24px -10px rgba(0,0,0,.45);
      transition: width .45s var(--ease), background .3s;
      animation: slide-in .8s var(--ease) both; animation-delay: calc(var(--i) * 120ms + .6s);
    }
    .float a::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--gold-grad); }
    .float a span { order: -1; opacity: 0; transition: opacity .3s; }
    .float a app-icon { width: 22px; height: 22px; }
    .float a:hover { width: 170px; }
    .float a:hover span { opacity: 1; transition-delay: .12s; }
    .mail { --c: linear-gradient(135deg, #9a1220, #5a0610) !important; }
    .mail app-icon { color: var(--g-300); }
    .fb { --c: #1877f2 !important; }
    .wa { --c: #1fb855 !important; }
    .ig { --c: linear-gradient(45deg, #f9ce34, #ee2a7b 45%, #6228d7) !important; }
    .yt { --c: #ff0000 !important; }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: none; } }

    .to-top {
      position: fixed; right: 20px; bottom: 20px; z-index: 90; width: 52px; height: 52px; border-radius: 50%; border: 0; cursor: pointer;
      background: var(--m-800); color: var(--g-300); display: grid; place-items: center;
      opacity: 0; transform: translateY(20px) scale(.8); pointer-events: none; transition: all .4s var(--ease);
      box-shadow: 0 10px 30px -10px rgba(0,0,0,.5);
    }
    .to-top.show { opacity: 1; transform: none; pointer-events: auto; }
    .to-top:hover { background: var(--m-600); }
    .to-top svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    .to-top circle { fill: none; stroke: var(--g-500); stroke-width: 2.5; stroke-dasharray: 113; stroke-dashoffset: calc(113 - 113 * var(--p, 0)); }
    .to-top app-icon { width: 24px; height: 24px; }

    /* Phones: a slim column of round-edged tabs; page content keeps 50px clear on the right (styles.scss). */
    @media (max-width: 640px) {
      .float { gap: 5px; }
      .float a { height: 40px; width: 40px; padding: 0 9px; border-radius: 12px 0 0 12px; }
      .float a app-icon { width: 19px; height: 19px; }
      .float a:hover { width: 40px; }
      .float a span { display: none; }
      .to-top { width: 40px; height: 40px; right: 0; bottom: 18px; border-radius: 12px 0 0 12px; }
      .to-top svg { display: none; }
      .to-top app-icon { width: 22px; height: 22px; }
    }
  `],
})
export class SocialFloatComponent {
  readonly settings$ = inject(ApiService).settings();
  readonly progress = signal(0);

  @HostListener('window:scroll')
  onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    this.progress.set(max > 0 ? Math.min(scrollY / max, 1) : 0);
  }

  top() { scrollTo({ top: 0, behavior: 'smooth' }); }
}
