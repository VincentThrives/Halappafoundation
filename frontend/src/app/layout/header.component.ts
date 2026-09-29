import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { LangService, TPipe } from '../core/lang.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe, IconComponent, AsyncPipe],
  template: `
  <header class="hdr" [class.solid]="scrolled()" [class.drawer-open]="drawer()">
    <div class="topbar">
      <div class="container tb-in">
        @if (settings$ | async; as s) {
          <div class="tb-contacts">
            <a [href]="'tel:+91' + s['phone']"><app-icon name="phone" /> +91 {{ s['phone'] }}</a>
            <a [href]="'mailto:' + s['email']"><app-icon name="mail" /> {{ s['email'] }}</a>
          </div>
        }
        <div class="tb-right">
          <span class="tb-tag">{{ 'brand.tagline' | t }}</span>
          <a routerLink="/admin/login" class="tb-signin"><app-icon name="logout" /> {{ 'nav.signin' | t }}</a>
        </div>
      </div>
    </div>

    <div class="container bar">
      <a routerLink="/" class="brand" aria-label="Home">
        <span class="logo-ring"><img src="img/logo.jpg" alt="Halappa Foundation logo"></span>
        <span class="brand-txt">
          <b>{{ 'brand.name' | t }}</b>
          <small>{{ 'brand.person' | t }}</small>
        </span>
      </a>

      <nav class="nav" aria-label="Main">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{ 'nav.home' | t }}</a>
        <a routerLink="/about" routerLinkActive="active">{{ 'nav.about' | t }}</a>
        <a routerLink="/stalwart-says" routerLinkActive="active">{{ 'nav.stalwart' | t }}</a>
        <div class="dd">
          <a routerLink="/press" routerLinkActive="active">{{ 'nav.press' | t }} <app-icon name="chev" /></a>
          <div class="dd-menu">
            @for (c of menu.press; track c) { <a [routerLink]="['/press', c]" routerLinkActive="on">{{ 'cat.' + c | t }}</a> }
          </div>
        </div>
        <div class="dd">
          <a routerLink="/my-views" routerLinkActive="active">{{ 'nav.views' | t }} <app-icon name="chev" /></a>
          <div class="dd-menu">
            @for (c of menu.views; track c) { <a [routerLink]="['/my-views', c]" routerLinkActive="on">{{ 'cat.' + c | t }}</a> }
          </div>
        </div>
        <div class="dd">
          <a routerLink="/gallery" routerLinkActive="active">{{ 'nav.gallery' | t }} <app-icon name="chev" /></a>
          <div class="dd-menu">
            @for (c of menu.gallery; track c) { <a [routerLink]="['/gallery', c]" routerLinkActive="on">{{ 'cat.' + c | t }}</a> }
          </div>
        </div>
        <a routerLink="/timeline" routerLinkActive="active">{{ 'nav.timeline' | t }}</a>
        <a routerLink="/contact" routerLinkActive="active">{{ 'nav.contact' | t }}</a>
      </nav>

      <div class="lang-dd" [class.open]="langOpen()" (mouseleave)="langOpen.set(false)">
        <button class="lang" (click)="langOpen.set(!langOpen())" aria-label="Choose language" [attr.aria-expanded]="langOpen()">
          <app-icon name="globe" /><span>{{ lang.lang() === 'kn' ? 'ಕನ್ನಡ' : 'English' }}</span><app-icon name="chev" class="chev" />
        </button>
        <div class="lang-menu" role="menu">
          <button role="menuitemradio" [attr.aria-checked]="lang.lang() === 'kn'" [class.on]="lang.lang() === 'kn'" (click)="pickLang('kn')">
            <b>ಕನ್ನಡ</b><small>Kannada</small>
          </button>
          <button role="menuitemradio" [attr.aria-checked]="lang.lang() === 'en'" [class.on]="lang.lang() === 'en'" (click)="pickLang('en')">
            <b>English</b><small>ಇಂಗ್ಲಿಷ್</small>
          </button>
        </div>
      </div>
      <button class="burger" (click)="drawer.set(!drawer())" [attr.aria-expanded]="drawer()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>

    <!-- Mobile drawer -->
    <div class="drawer" [class.show]="drawer()">
      <nav>
        <a routerLink="/" style="--i:0">{{ 'nav.home' | t }}</a>
        <a routerLink="/about" style="--i:1">{{ 'nav.about' | t }}</a>
        <a routerLink="/stalwart-says" style="--i:2">{{ 'nav.stalwart' | t }}</a>
        <details style="--i:3"><summary>{{ 'nav.press' | t }} <app-icon name="chev" /></summary>
          @for (c of menu.press; track c) { <a [routerLink]="['/press', c]">{{ 'cat.' + c | t }}</a> }
        </details>
        <details style="--i:4"><summary>{{ 'nav.views' | t }} <app-icon name="chev" /></summary>
          @for (c of menu.views; track c) { <a [routerLink]="['/my-views', c]">{{ 'cat.' + c | t }}</a> }
        </details>
        <details style="--i:5"><summary>{{ 'nav.gallery' | t }} <app-icon name="chev" /></summary>
          @for (c of menu.gallery; track c) { <a [routerLink]="['/gallery', c]">{{ 'cat.' + c | t }}</a> }
        </details>
        <a routerLink="/timeline" style="--i:6">{{ 'nav.timeline' | t }}</a>
        <a routerLink="/contact" style="--i:7">{{ 'nav.contact' | t }}</a>
        <a routerLink="/admin/login" style="--i:8"><span><app-icon name="logout" /> {{ 'nav.signin' | t }}</span></a>
        <button class="btn btn-sm" style="--i:9" (click)="lang.toggle()"><app-icon name="globe" /> {{ 'lang.switch' | t }}</button>
      </nav>
    </div>
  </header>
  `,
  styles: [`
    :host { display: contents; }
    .hdr { position: fixed; inset: 0 0 auto; z-index: 100; view-transition-name: site-header; transition: background .5s, box-shadow .5s, transform .5s; }
    .topbar { background: rgba(36,2,5,.55); color: var(--g-300); font-size: .8rem; max-height: 40px; overflow: hidden; transition: max-height .5s var(--ease), opacity .4s; }
    .tb-in { display: flex; justify-content: space-between; align-items: center; height: 40px; gap: 16px; }
    .tb-contacts { display: flex; gap: 22px; }
    .tb-contacts a { color: var(--g-300); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: color .3s; }
    .tb-contacts a:hover { color: #fff; }
    .tb-tag { letter-spacing: .2em; text-transform: uppercase; font-size: .7rem; opacity: .85; }
    .tb-right { display: flex; align-items: center; gap: 18px; }
    .tb-signin {
      display: inline-flex; align-items: center; gap: 6px; padding: 3px 14px; border-radius: 999px;
      color: var(--m-900); background: var(--gold-grad); text-decoration: none; font-weight: 600; font-size: .78rem;
      transition: transform .3s var(--ease), box-shadow .3s;
    }
    .tb-signin:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -6px rgba(245,210,122,.8); }
    .tb-signin app-icon { width: 14px; height: 14px; }

    .bar { display: flex; align-items: center; gap: 22px; height: 86px; transition: height .5s var(--ease); }
    .hdr.solid { background: rgba(58,3,8,.92); backdrop-filter: blur(14px) saturate(1.3); box-shadow: 0 10px 40px -10px rgba(0,0,0,.5); }
    .hdr.solid .topbar { max-height: 0; opacity: 0; }
    .hdr.solid .bar { height: 70px; }

    .brand { display: flex; align-items: center; gap: 12px; text-decoration: none; margin-right: auto; }
    .logo-ring { width: 58px; height: 58px; border-radius: 50%; padding: 3px; background: var(--gold-grad); box-shadow: 0 6px 20px -6px rgba(245,210,122,.7); transition: transform .6s var(--ease), width .5s, height .5s; flex: none; }
    .brand:hover .logo-ring { transform: rotate(-8deg) scale(1.06); }
    .hdr.solid .logo-ring { width: 48px; height: 48px; }
    .logo-ring img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .brand-txt { display: flex; flex-direction: column; line-height: 1.15; }
    .brand-txt b { font-family: var(--font-head); font-size: 1.3rem; color: #fff; letter-spacing: .01em; }
    .brand-txt small { color: var(--g-400); font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; }

    .nav { display: flex; align-items: center; gap: 4px; }
    .nav > a, .dd > a {
      position: relative; color: #fff; text-decoration: none; font-weight: 500; font-size: .92rem;
      padding: 10px 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;
    }
    .nav > a::after, .dd > a::after {
      content: ''; position: absolute; left: 12px; right: 12px; bottom: 4px; height: 2px; background: var(--gold-grad);
      transform: scaleX(0); transform-origin: right; transition: transform .45s var(--ease);
    }
    .nav > a:hover::after, .dd > a:hover::after, .nav a.active::after { transform: scaleX(1); transform-origin: left; }
    .nav a.active { color: var(--g-400); }
    .dd { position: relative; }
    .dd app-icon { width: 1em; height: 1em; transition: transform .3s; }
    .dd:hover > a app-icon { transform: rotate(180deg); }
    .dd-menu {
      position: absolute; top: 100%; left: 0; min-width: 220px; padding: 10px; border-radius: 14px;
      background: #fff; box-shadow: 0 30px 60px -20px rgba(36,2,5,.5); border-top: 3px solid var(--g-500);
      opacity: 0; visibility: hidden; transform: translateY(14px); transition: all .35s var(--ease);
    }
    .dd:hover .dd-menu, .dd:focus-within .dd-menu { opacity: 1; visibility: visible; transform: none; }
    .dd-menu a { display: block; padding: 10px 14px; border-radius: 8px; color: var(--m-800); text-decoration: none; font-size: .92rem; transition: all .25s; }
    .dd-menu a:hover, .dd-menu a.on { background: var(--cream-2); color: var(--m-600); padding-left: 20px; }

    .lang {
      display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; cursor: pointer;
      background: transparent; color: var(--g-300); border: 1.5px solid rgba(245,210,122,.6); font-weight: 600; font-size: .88rem;
      transition: all .35s var(--ease);
    }
    .lang:hover { background: var(--gold-grad); color: var(--m-900); border-color: transparent; }
    .lang span { font-family: 'Noto Sans Kannada', 'Poppins', sans-serif; }
    .lang .chev { width: 1em; height: 1em; transition: transform .3s; }
    .lang-dd { position: relative; }
    .lang-dd:hover .lang, .lang-dd.open .lang { background: var(--gold-grad); color: var(--m-900); border-color: transparent; }
    .lang-dd:hover .chev, .lang-dd.open .chev { transform: rotate(180deg); }
    .lang-menu {
      position: absolute; top: calc(100% + 8px); right: 0; min-width: 170px; padding: 8px; border-radius: 14px;
      background: #fff; box-shadow: 0 30px 60px -20px rgba(36,2,5,.5); border-top: 3px solid var(--g-500);
      opacity: 0; visibility: hidden; transform: translateY(12px); transition: all .3s var(--ease);
    }
    .lang-menu::before { content: ''; position: absolute; left: 0; right: 0; top: -12px; height: 12px; } /* hover bridge */
    .lang-dd:hover .lang-menu, .lang-dd.open .lang-menu { opacity: 1; visibility: visible; transform: none; }
    .lang-menu button {
      display: flex; width: 100%; justify-content: space-between; align-items: baseline; gap: 12px;
      padding: 10px 14px; border: 0; border-radius: 8px; background: none; cursor: pointer; color: var(--m-800); text-align: left;
      transition: all .25s;
    }
    .lang-menu button b { font-family: 'Noto Sans Kannada', 'Poppins', sans-serif; font-weight: 600; }
    .lang-menu button small { color: var(--muted); font-size: .75rem; }
    .lang-menu button:hover { background: var(--cream-2); padding-left: 20px; }
    .lang-menu button.on { background: var(--maroon-grad); color: var(--g-300); }
    .lang-menu button.on small { color: rgba(255,255,255,.7); }

    .burger { display: none; width: 46px; height: 46px; border-radius: 12px; border: 1.5px solid rgba(245,210,122,.5); background: transparent; cursor: pointer; padding: 12px 11px; position: relative; z-index: 2; }
    .burger span { display: block; height: 2px; background: var(--g-300); margin: 4px 0; transition: transform .4s var(--ease), opacity .3s; }
    .drawer-open .burger span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
    .drawer-open .burger span:nth-child(2) { opacity: 0; }
    .drawer-open .burger span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

    .drawer {
      position: fixed; inset: 0; z-index: 1; background: var(--maroon-grad); padding: 110px 28px 40px; overflow-y: auto;
      clip-path: circle(0 at calc(100% - 44px) 44px); transition: clip-path .7s var(--ease); visibility: hidden;
    }
    .drawer.show { clip-path: circle(150% at calc(100% - 44px) 44px); visibility: visible; }
    .drawer nav { display: flex; flex-direction: column; gap: 4px; }
    .drawer nav > * { opacity: 0; transform: translateX(40px); transition: all .5s var(--ease); transition-delay: calc(var(--i) * 50ms + .2s); }
    .drawer.show nav > * { opacity: 1; transform: none; }
    .drawer a, .drawer summary { color: #fff; text-decoration: none; font-family: var(--font-head); font-size: 1.5rem; padding: 10px 0; border-bottom: 1px solid rgba(245,210,122,.15); display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; }
    .drawer summary::-webkit-details-marker { display: none; }
    .drawer details a { font-family: var(--font-body); font-size: 1rem; padding: 8px 0 8px 18px; color: var(--g-300); border: 0; }
    .drawer details[open] summary app-icon { transform: rotate(180deg); }
    .drawer .btn { margin-top: 24px; align-self: flex-start; }

    @media (max-width: 1180px) {
      .nav { display: none; }
      .burger { display: block; }
    }
    @media (max-width: 640px) {
      .topbar { display: none; }
      .lang span, .lang .chev { display: none; }
      .lang { padding: 10px; }
      .brand-txt b { font-size: 1.05rem; }
      .brand-txt small { font-size: .62rem; letter-spacing: .1em; }
      .logo-ring { width: 48px; height: 48px; }
      .bar { height: 72px; gap: 10px; }
    }
  `],
})
export class HeaderComponent {
  readonly lang = inject(LangService);
  readonly settings$ = inject(ApiService).settings();
  readonly menu = MENU;
  readonly scrolled = signal(false);
  readonly drawer = signal(false);
  readonly langOpen = signal(false);

  pickLang(l: 'en' | 'kn') {
    this.lang.set(l);
    this.langOpen.set(false);
  }

  constructor() {
    inject(Router).events.subscribe(e => { if (e instanceof NavigationEnd) this.drawer.set(false); });
  }

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(scrollY > 60); }
}
