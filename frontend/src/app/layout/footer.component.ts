import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';
import { RevealDirective } from '../core/motion';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TPipe, IconComponent, AsyncPipe, RevealDirective],
  template: `
  <footer class="ftr">
    <div class="glow"></div>
    <div class="container">
      <div class="top" appReveal="up">
        <a routerLink="/" class="f-brand">
          <img src="img/logo.jpg" alt="">
          <span><b>{{ 'brand.name' | t }}</b><small>{{ 'brand.person' | t }}</small></span>
        </a>
        <p>{{ 'footer.about' | t }}</p>
        @if (settings$ | async; as s) {
          <div class="socials">
            <a [href]="'mailto:' + s['email']" aria-label="Email"><app-icon name="mail" /></a>
            @if (s['facebook']) { <a [href]="s['facebook']" target="_blank" rel="noopener" aria-label="Facebook"><app-icon name="facebook" /></a> }
            <a [href]="'https://wa.me/' + s['whatsapp']" target="_blank" rel="noopener" aria-label="WhatsApp"><app-icon name="whatsapp" /></a>
            @if (s['instagram']) { <a [href]="s['instagram']" target="_blank" rel="noopener" aria-label="Instagram"><app-icon name="instagram" /></a> }
            @if (s['youtube']) { <a [href]="s['youtube']" target="_blank" rel="noopener" aria-label="YouTube"><app-icon name="youtube" /></a> }
            @if (s['twitter']) { <a [href]="s['twitter']" target="_blank" rel="noopener" aria-label="X"><app-icon name="x" /></a> }
          </div>
        }
      </div>

      <div class="cols">
        <div appReveal="up" [delay]="0">
          <h4>{{ 'nav.press' | t }}</h4>
          @for (c of menu.press; track c) { <a [routerLink]="['/press', c]">{{ 'cat.' + c | t }}</a> }
        </div>
        <div appReveal="up" [delay]="100">
          <h4>{{ 'nav.views' | t }}</h4>
          @for (c of menu.views; track c) { <a [routerLink]="['/my-views', c]">{{ 'cat.' + c | t }}</a> }
        </div>
        <div appReveal="up" [delay]="200">
          <h4>{{ 'nav.gallery' | t }}</h4>
          @for (c of menu.gallery; track c) { <a [routerLink]="['/gallery', c]">{{ 'cat.' + c | t }}</a> }
        </div>
        <div appReveal="up" [delay]="300" class="main-links">
          <a routerLink="/">{{ 'nav.home' | t }}</a>
          <a routerLink="/about">{{ 'nav.about' | t }}</a>
          <a routerLink="/stalwart-says">{{ 'nav.stalwart' | t }}</a>
          <a routerLink="/press">{{ 'nav.press' | t }}</a>
          <a routerLink="/my-views">{{ 'nav.views' | t }}</a>
          <a routerLink="/gallery">{{ 'nav.gallery' | t }}</a>
          <a routerLink="/timeline">{{ 'nav.timeline' | t }}</a>
          <a routerLink="/contact">{{ 'nav.contact' | t }}</a>
        </div>
      </div>
    </div>
    <div class="bottom">
      <div class="container b-in">
        <span>© {{ year }} {{ 'brand.name' | t }}. {{ 'footer.rights' | t }}</span>
        <a routerLink="/admin/login" class="signin"><app-icon name="logout" /> {{ 'footer.admin' | t }}</a>
      </div>
    </div>
  </footer>
  `,
  styles: [`
    .ftr { position: relative; overflow: hidden; background: var(--m-950); color: rgba(255,255,255,.75); padding-top: 90px; }
    .ftr::before { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: var(--gold-grad); }
    .glow { position: absolute; width: 600px; height: 600px; right: -200px; top: -300px; border-radius: 50%; background: radial-gradient(circle, rgba(154,18,32,.55), transparent 65%); pointer-events: none; }
    .top { display: grid; grid-template-columns: auto 1fr auto; gap: 40px; align-items: center; padding-bottom: 50px; border-bottom: 1px solid rgba(245,210,122,.15); position: relative; }
    .f-brand { display: flex; align-items: center; gap: 14px; text-decoration: none; }
    .f-brand img { width: 74px; height: 74px; border-radius: 50%; border: 3px solid var(--g-500); }
    .f-brand b { display: block; font-family: var(--font-head); color: #fff; font-size: 1.5rem; }
    .f-brand small { color: var(--g-400); letter-spacing: .15em; text-transform: uppercase; font-size: .72rem; }
    .top p { margin: 0; max-width: 520px; }
    .socials { display: flex; gap: 10px; }
    .socials a { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--g-300); border: 1.5px solid rgba(245,210,122,.35); transition: all .35s var(--ease); }
    .socials a:hover { background: var(--gold-grad); color: var(--m-900); transform: translateY(-4px) rotate(8deg); border-color: transparent; }
    .cols { display: grid; grid-template-columns: repeat(3, 1fr) 1.1fr; gap: 30px; padding: 50px 0 60px; position: relative; }
    h4 { color: var(--g-400); font-family: var(--font-body); font-size: .95rem; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 18px; }
    .cols a { display: block; color: rgba(255,255,255,.75); text-decoration: none; padding: 5px 0; font-size: .93rem; transition: color .3s, transform .3s var(--ease); }
    .cols a:hover { color: var(--g-300); transform: translateX(6px); }
    .main-links a { font-weight: 600; color: #fff; letter-spacing: .06em; text-transform: uppercase; font-size: .88rem; }
    .bottom { background: rgba(0,0,0,.3); font-size: .85rem; }
    .b-in { display: flex; justify-content: space-between; padding: 18px 0; gap: 12px; flex-wrap: wrap; }
    .signin { display: inline-flex; align-items: center; gap: 6px; color: var(--g-400); text-decoration: none; font-weight: 600; }
    .signin app-icon { width: 16px; height: 16px; }
    .signin:hover { color: var(--g-300); }
    @media (max-width: 640px) {
      .ftr { padding-top: 60px; }
      .f-brand img { width: 56px; height: 56px; }
      .f-brand b { font-size: 1.2rem; }
      .cols { padding: 36px 0 40px; gap: 24px 16px; }
      .b-in { flex-direction: column; align-items: flex-start; gap: 6px; }
    }
    @media (max-width: 900px) {
      .top { grid-template-columns: 1fr; text-align: left; gap: 20px; }
      .cols { grid-template-columns: 1fr 1fr; }
    }
  `],
})
export class FooterComponent {
  readonly settings$ = inject(ApiService).settings();
  readonly menu = MENU;
  readonly year = new Date().getFullYear();
}
