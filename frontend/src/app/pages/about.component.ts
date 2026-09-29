import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';
import { IconComponent } from '../core/icon.component';
import { CountUpDirective, RevealDirective } from '../core/motion';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, TPipe, IconComponent, RevealDirective, CountUpDirective],
  template: `
  <section class="page-banner">
    <div class="container">
      <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ 'nav.about' | t }}</div>
      <h1>{{ 'brand.person' | t }}</h1>
      <p class="lead">{{ 'about.lead' | t }}</p>
    </div>
  </section>

  <!-- Profile -->
  <section class="section">
    <div class="container profile">
      <div class="portrait" appReveal="left">
        <div class="arch"><img src="img/portrait.jpg" alt=""></div>
        <div class="sig"><img src="img/logo.jpg" alt=""><span>{{ 'brand.name' | t }}</span></div>
      </div>
      <div appReveal="right">
        <span class="eyebrow">{{ 'about.profile' | t }}</span>
        <h2 class="section-title">{{ 'brand.person' | t }}</h2>
        <dl class="facts">
          @for (f of facts; track f; let i = $index) {
            <div appReveal="up" [delay]="i * 90">
              <dt>{{ 'about.' + f | t }}</dt>
              <dd>{{ 'about.' + f + '.v' | t }}</dd>
            </div>
          }
        </dl>
      </div>
    </div>
  </section>

  <!-- Positions -->
  <section class="section positions">
    <div class="container">
      <div class="section-head" appReveal="up">
        <span class="eyebrow">{{ 'about.positions' | t }}</span>
        <h2 class="section-title">{{ 'about.positions' | t }}</h2>
      </div>
      <div class="pos-grid">
        @for (n of [1, 2, 3, 4, 5, 6, 7, 8, 9]; track n; let i = $index) {
          <div class="pos" [class.past]="n > 6" appReveal="up" [delay]="(i % 3) * 100">
            <span class="tag">{{ (n > 6 ? 'about.past' : 'about.present') | t }}</span>
            <h3>{{ 'pos.' + n + '.r' | t }}</h3>
            <p>{{ 'pos.' + n + '.o' | t }}</p>
          </div>
        }
      </div>
    </div>
  </section>

  <!-- Community reach -->
  <section class="section reach">
    <div class="container">
      <div class="section-head" appReveal="up">
        <span class="eyebrow light">{{ 'about.reach' | t }}</span>
        <h2 class="section-title">{{ 'about.reach.sub' | t }}</h2>
      </div>
      <div class="reach-grid">
        @for (r of reach; track r.k; let i = $index) {
          <div class="ring" appReveal="zoom" [delay]="i * 150">
            <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="bg" /><circle cx="60" cy="60" r="54" class="fg" [style.--pct]="r.n / 22" /></svg>
            <strong><span [appCountUp]="r.n"></span></strong>
            <small>{{ 'lakh' | t }}</small>
            <b>{{ 'state.' + r.k | t }}</b>
          </div>
        }
      </div>
    </div>
  </section>

  <!-- Legacy -->
  <section class="section">
    <div class="container legacy" appReveal="up">
      <app-icon name="quote" class="q" />
      <h2>{{ 'about.legacy.title' | t }}</h2>
      <p>{{ 'about.legacy.text' | t }}</p>
      <a class="btn btn-maroon" routerLink="/timeline">{{ 'nav.timeline' | t }} <app-icon name="arrow" /></a>
    </div>
  </section>
  `,
  styles: [`
    .profile { display: grid; grid-template-columns: .9fr 1.1fr; gap: 80px; align-items: center; }
    .portrait { position: relative; }
    .arch { border-radius: 260px 260px 24px 24px; overflow: hidden; padding: 8px; background: var(--gold-grad); box-shadow: var(--shadow); }
    .arch img { border-radius: 252px 252px 18px 18px; width: 100%; aspect-ratio: 4/5; object-fit: cover; object-position: top; transition: transform 1.5s var(--ease); }
    .portrait:hover .arch img { transform: scale(1.05); }
    .sig { position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; background: var(--m-800); color: var(--g-300); padding: 10px 22px 10px 10px; border-radius: 999px; white-space: nowrap; box-shadow: var(--shadow); font-weight: 600; }
    .sig img { width: 40px; height: 40px; border-radius: 50%; }
    .facts { margin: 30px 0 0; display: grid; gap: 4px; }
    .facts div { display: grid; grid-template-columns: 160px 1fr; gap: 20px; padding: 18px 0; border-bottom: 1px dashed var(--line); }
    .facts dt { color: var(--g-700); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: .82rem; padding-top: 3px; }
    .facts dd { margin: 0; font-weight: 500; color: var(--m-900); }

    .positions { background: var(--cream-2); }
    .pos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
    .pos { background: #fff; border-radius: 18px; padding: 28px; border: 1px solid var(--line); border-top: 4px solid var(--m-700); transition: transform .5s var(--ease), box-shadow .5s var(--ease); }
    .pos:hover { transform: translateY(-8px); box-shadow: var(--shadow); }
    .pos.past { border-top-color: var(--g-500); }
    .tag { display: inline-block; font-size: .7rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: 4px 12px; border-radius: 999px; background: var(--m-700); color: var(--g-300); margin-bottom: 14px; }
    .pos.past .tag { background: var(--g-300); color: var(--m-800); }
    .pos h3 { font-size: 1.3rem; margin-bottom: 6px; }
    .pos p { margin: 0; color: var(--muted); }

    .reach { background: var(--maroon-grad); color: #fff; }
    .reach h2 { color: #fff; }
    .reach .eyebrow { color: var(--g-400); }
    .reach-grid { display: flex; justify-content: center; gap: 60px; flex-wrap: wrap; }
    .ring { position: relative; width: 220px; text-align: center; }
    .ring svg { width: 220px; height: 220px; transform: rotate(-90deg); }
    .ring circle { fill: none; stroke-width: 6; }
    .ring .bg { stroke: rgba(245,210,122,.15); }
    .ring .fg { stroke: var(--g-400); stroke-linecap: round; stroke-dasharray: 339.3; stroke-dashoffset: 339.3; transition: stroke-dashoffset 2s var(--ease) .3s; }
    .ring.in .fg { stroke-dashoffset: calc(339.3 - 339.3 * var(--pct)); }
    .ring strong { position: absolute; top: 62px; left: 0; right: 0; font-family: 'Playfair Display', serif; font-size: 3.6rem; line-height: 1; color: var(--g-300); }
    .ring small { position: absolute; top: 128px; left: 0; right: 0; color: rgba(255,255,255,.7); font-size: .85rem; }
    .ring b { display: block; margin-top: 14px; font-size: 1.1rem; color: #fff; }

    .legacy { max-width: 860px; text-align: center; }
    .legacy .q { width: 56px; height: 56px; color: var(--g-500); margin: 0 auto 16px; }
    .legacy p { font-size: 1.15rem; color: var(--muted); margin-bottom: 30px; }

    @media (max-width: 900px) {
      .profile { grid-template-columns: 1fr; gap: 60px; }
      .portrait { max-width: 420px; margin: 0 auto; }
      .pos-grid { grid-template-columns: 1fr 1fr; }
      .facts div { grid-template-columns: 1fr; gap: 4px; }
    }
    /* Phones: compact 2-up position cards and the three community rings in one row, like desktop. */
    @media (max-width: 640px) {
      .profile { gap: 48px; }
      .portrait { max-width: 300px; }
      .facts { margin-top: 18px; }
      .facts div { padding: 12px 0; }
      .pos-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .pos { padding: 14px 12px; border-radius: 14px; }
      .pos:hover { transform: none; }
      .tag { font-size: .6rem; padding: 2px 8px; margin-bottom: 8px; }
      .pos h3 { font-size: 1rem; margin-bottom: 4px; }
      .pos p { font-size: .78rem; line-height: 1.45; }
      .reach-grid { gap: 8px; flex-wrap: nowrap; }
      .ring { width: 33%; flex: 1; }
      .ring svg { width: 100%; height: auto; }
      .ring strong { top: 30%; font-size: 1.9rem; }
      .ring small { top: 58%; font-size: .62rem; }
      .ring b { font-size: .78rem; margin-top: 6px; line-height: 1.3; }
      .legacy p { font-size: 1rem; }
    }
  `],
})
export class AboutComponent {
  readonly facts = ['father', 'native', 'qual', 'family'];
  readonly reach = [{ k: 'ka', n: 22 }, { k: 'tn', n: 15 }, { k: 'ap', n: 5 }];
}
