import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { LangService, LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { IconComponent } from '../core/icon.component';
import { CountUpDirective, ParallaxDirective, RevealDirective } from '../core/motion';
import { GalleryItem, Post } from '../core/models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, TPipe, LocPipe, IconComponent, RevealDirective, CountUpDirective, ParallaxDirective, DatePipe],
  template: `
  <!-- ================= HERO SLIDER ================= -->
  <section class="hero">
    <div class="rays"></div>
    <div class="watermark">{{ lang.lang() === 'kn' ? 'ಹಾಲಪ್ಪ' : 'HALAPPA' }}</div>
    @for (s of slides; track s.key; let i = $index) {
      <div class="slide" [class.active]="i === current()">
        <div class="container slide-in">
          <div class="copy">
            <span class="kicker">{{ 'hero.kicker' | t }} · {{ 'brand.name' | t }}</span>
            <h1>
              @for (line of (s.key + '.title' | t).split('\n'); track $index) {
                <span class="line"><span [style.transition-delay.ms]="200 + $index * 120">{{ line }}</span></span>
              }
            </h1>
            <p>{{ s.key + '.text' | t }}</p>
            <div class="ctas">
              <a class="btn" routerLink="/about">{{ 'hero.cta.know' | t }} <app-icon name="arrow" /></a>
              <a class="btn btn-outline" routerLink="/contact">{{ 'hero.cta.contact' | t }}</a>
            </div>
          </div>
          <div class="visual" [class.round]="s.round">
            <div class="frame"><img [src]="s.img" [alt]="'brand.person' | t"></div>
            <div class="orbit"></div>
            <div class="badge"><img src="img/logo.jpg" alt=""></div>
          </div>
        </div>
      </div>
    }
    <div class="dots">
      @for (s of slides; track s.key; let i = $index) {
        <button [class.on]="i === current()" (click)="go(i)" [attr.aria-label]="'Slide ' + (i + 1)"><i></i></button>
      }
    </div>
    <a class="scroll-cue" href="#intro"><span>{{ 'hero.scroll' | t }}</span><i></i></a>
  </section>

  <!-- ================= MARQUEE ================= -->
  <div class="marquee" aria-hidden="true">
    <div class="track">
      @for (r of [0, 1]; track r) {
        @for (n of [1, 2, 3, 4, 5, 6]; track n) {
          <span>{{ 'init.' + n + '.t' | t }}</span><b>✦</b>
        }
      }
    </div>
  </div>

  <!-- ================= STATS ================= -->
  <section class="stats container" id="intro">
    <div class="stat" appReveal="up" [delay]="0"><strong><span [appCountUp]="12" suffix="+"></span></strong><small>{{ 'stat.years' | t }}</small></div>
    <div class="stat" appReveal="up" [delay]="120"><strong><span [appCountUp]="42" suffix="+"></span></strong><small>{{ 'stat.members' | t }}</small></div>
    <div class="stat" appReveal="up" [delay]="240"><strong><span [appCountUp]="4"></span></strong><small>{{ 'stat.states' | t }}</small></div>
    <div class="stat" appReveal="up" [delay]="360"><strong><span [appCountUp]="6"></span></strong><small>{{ 'stat.initiatives' | t }}</small></div>
  </section>

  <!-- ================= ABOUT TEASER ================= -->
  <section class="section about">
    <div class="container about-grid">
      <div class="about-img" appReveal="left">
        <div class="img-wrap"><img src="img/portrait.jpg" alt="" appParallax [speed]="0.08"></div>
        <div class="float-card" appReveal="zoom" [delay]="400">
          <img src="img/logo.jpg" alt="">
          <div><b>{{ 'brand.person' | t }}</b><small>{{ 'pos.1.r' | t }}, KPCC</small></div>
        </div>
      </div>
      <div appReveal="right">
        <span class="eyebrow">{{ 'home.about.eyebrow' | t }}</span>
        <h2 class="section-title">{{ 'home.about.title' | t }}</h2>
        <p>{{ 'home.about.p1' | t }}</p>
        <p>{{ 'home.about.p2' | t }}</p>
        <a class="btn btn-maroon" routerLink="/about">{{ 'home.about.cta' | t }} <app-icon name="arrow" /></a>
      </div>
    </div>
  </section>

  <!-- ================= INITIATIVES ================= -->
  <section class="section init">
    <div class="container">
      <div class="section-head" appReveal="up">
        <span class="eyebrow">{{ 'init.eyebrow' | t }}</span>
        <h2 class="section-title">{{ 'init.title' | t }}</h2>
        <p>{{ 'init.sub' | t }}</p>
      </div>
      <div class="init-grid swipe">
        @for (it of initiatives; track it.n; let i = $index) {
          <article class="init-card" appReveal="up" [delay]="(i % 3) * 120">
            <span class="num">0{{ it.n }}</span>
            <div class="ic"><app-icon [name]="it.icon" /></div>
            <h3>{{ 'init.' + it.n + '.t' | t }}</h3>
            <p>{{ 'init.' + it.n + '.d' | t }}</p>
          </article>
        }
      </div>
      <p class="swipe-hint">{{ 'swipe' | t }}</p>
    </div>
  </section>

  <!-- ================= QUOTE BAND ================= -->
  <section class="quote-band">
    <div class="qb-bg" appParallax [speed]="0.25"></div>
    <div class="container qb-in">
      <figure class="qb-photo" appReveal="left"><img src="img/office.jpg" alt="Muralidhar Halappa" loading="lazy"></figure>
      <div class="qb-text" appReveal="blur">
        <app-icon name="quote" class="qmark" />
        <blockquote>{{ 'home.quote' | t }}</blockquote>
        <cite>— {{ 'brand.person' | t }}</cite>
      </div>
    </div>
  </section>

  <!-- ================= LATEST ================= -->
  <section class="section">
    <div class="container">
      <div class="section-head" appReveal="up">
        <span class="eyebrow">{{ 'home.latest.eyebrow' | t }}</span>
        <h2 class="section-title">{{ 'home.latest.title' | t }}</h2>
      </div>
      @if (posts() === null) {
        <div class="card-grid swipe">@for (n of [1, 2, 3]; track n) { <div class="skeleton" style="height: 380px"></div> }</div>
      } @else {
        <div class="card-grid swipe">
          @for (p of posts(); track p.id; let i = $index) {
            <a class="post-card" [routerLink]="['/post', p.id]" appReveal="up" [delay]="i * 120">
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
        <p class="swipe-hint">{{ 'swipe' | t }}</p>
      }
    </div>
  </section>

  <!-- ================= GALLERY STRIP ================= -->
  @if (photos().length) {
    <section class="section strip">
      <div class="container strip-head" appReveal="up">
        <h2 class="section-title">{{ 'home.gallery.title' | t }}</h2>
        <a class="btn btn-sm btn-maroon" routerLink="/gallery">{{ 'home.gallery.cta' | t }} <app-icon name="arrow" /></a>
      </div>
      <div class="container strip-grid">
        @for (g of photos(); track g.id; let i = $index) {
          <a class="ph-tile" routerLink="/gallery" appReveal="zoom" [delay]="i * 100">
            <img [src]="g.image" alt="" loading="lazy">
            <span>{{ g | loc: 'caption' }}</span>
          </a>
        }
      </div>
    </section>
  }

  <!-- ================= CTA ================= -->
  <section class="cta">
    <div class="container cta-in" appReveal="zoom">
      <div>
        <h2>{{ 'home.cta.title' | t }}</h2>
        <p>{{ 'home.cta.text' | t }}</p>
      </div>
      <div class="cta-btns">
        <a class="btn" routerLink="/contact"><app-icon name="mail" /> {{ 'send.email' | t }}</a>
        <a class="btn btn-wa" routerLink="/contact"><app-icon name="whatsapp" /> {{ 'send.whatsapp' | t }}</a>
      </div>
    </div>
  </section>
  `,
  styles: [`
    /* ---------- Hero ---------- */
    /* Slides share one grid cell, so the hero is at least one screen tall but grows to fit its content */
    .hero { position: relative; display: grid; min-height: max(100vh, 680px); overflow: hidden; color: #fff;
      background: radial-gradient(ellipse at 75% 40%, #9a1220 0%, #5a0610 45%, #240205 100%); }
    .rays { position: absolute; inset: -50%; background: repeating-conic-gradient(from 0deg at 72% 45%, rgba(245,210,122,.07) 0deg 6deg, transparent 6deg 18deg); animation: spin 90s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .watermark { position: absolute; bottom: -4vw; left: -1vw; font-family: 'Playfair Display', 'Baloo Tamma 2', serif; font-weight: 800; font-size: 19vw; line-height: 1; color: transparent; -webkit-text-stroke: 1px rgba(245,210,122,.12); pointer-events: none; white-space: nowrap; }
    /* padding-top clears the full header (top bar 40 + bar 86) so hero text never slides under it */
    .slide { position: relative; grid-area: 1 / 1; display: flex; flex-direction: column; justify-content: center; padding: 150px 0 90px; opacity: 0; visibility: hidden; transition: opacity 1.2s var(--ease), visibility 1.2s; }
    .slide.active { opacity: 1; visibility: visible; }
    .slide-in { display: grid; grid-template-columns: 1.15fr 1fr; gap: 50px; align-items: center; }
    .kicker { display: inline-block; color: var(--g-400); letter-spacing: .25em; text-transform: uppercase; font-size: .78rem; font-weight: 600; margin-bottom: 18px;
      opacity: 0; transform: translateY(20px); transition: all .9s var(--ease) .1s; }
    .hero h1 { color: #fff; font-size: clamp(2.5rem, 5.6vw, 5rem); line-height: 1.08; margin-bottom: 24px; }
    :host-context(html.lang-kn) .hero h1 { font-size: clamp(2.2rem, 4.6vw, 4.2rem); line-height: 1.3; }
    .hero h1 .line { display: block; overflow: hidden; padding-bottom: .06em; }
    .hero h1 .line > span { display: inline-block; transform: translateY(110%); transition: transform 1.1s var(--ease); }
    .hero h1 .line:nth-child(2) > span { background: var(--gold-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .hero p { font-size: 1.12rem; max-width: 560px; color: rgba(255,255,255,.85); opacity: 0; transform: translateY(30px); transition: all 1s var(--ease) .5s; }
    .ctas { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 30px; opacity: 0; transform: translateY(30px); transition: all 1s var(--ease) .65s; }
    .slide.active .kicker, .slide.active p, .slide.active .ctas { opacity: 1; transform: none; }
    .slide.active h1 .line > span { transform: none; }

    .visual { position: relative; justify-self: center; width: min(430px, 38vw); aspect-ratio: 4/5; }
    .frame { position: absolute; inset: 0; border-radius: 220px 220px 24px 24px; overflow: hidden; padding: 6px; background: var(--gold-grad);
      box-shadow: 0 40px 80px -30px rgba(0,0,0,.8); clip-path: inset(100% 0 0 0 round 220px 220px 24px 24px); transition: clip-path 1.4s var(--ease) .2s; }
    .frame img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 214px 214px 20px 20px; transform: scale(1.25); transition: transform 7s ease-out; }
    .slide.active .frame { clip-path: inset(0 0 0 0 round 220px 220px 24px 24px); }
    .slide.active .frame img { transform: scale(1.02); }
    .visual.round { aspect-ratio: 1; }
    .visual.round .frame, .visual.round .frame img { border-radius: 50%; clip-path: circle(0 at 50% 50%); }
    .visual.round .frame img { clip-path: none; object-position: center; }
    .slide.active .visual.round .frame { clip-path: circle(70% at 50% 50%); }
    .orbit { position: absolute; inset: -26px; border: 1.5px dashed rgba(245,210,122,.4); border-radius: 240px 240px 40px 40px; animation: breathe 6s ease-in-out infinite; }
    .visual.round .orbit { border-radius: 50%; animation: spin 40s linear infinite; }
    @keyframes breathe { 50% { transform: scale(1.03); opacity: .6; } }
    .badge { position: absolute; left: -34px; bottom: 40px; width: 96px; height: 96px; border-radius: 50%; padding: 4px; background: var(--gold-grad);
      box-shadow: 0 20px 40px -10px rgba(0,0,0,.6); transform: scale(0) rotate(-120deg); transition: transform 1s var(--ease) .9s; }
    .badge img { width: 100%; height: 100%; border-radius: 50%; }
    .slide.active .badge { transform: none; }
    .visual.round .badge { display: none; }

    .dots { position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); display: flex; gap: 12px; z-index: 3; }
    .dots button { width: 54px; height: 4px; border: 0; padding: 0; border-radius: 4px; background: rgba(255,255,255,.25); cursor: pointer; overflow: hidden; }
    .dots i { display: block; height: 100%; width: 0; background: var(--gold-grad); }
    .dots button.on i { animation: fill 6.5s linear forwards; }
    @keyframes fill { to { width: 100%; } }
    .scroll-cue { position: absolute; right: 90px; bottom: 34px; color: var(--g-300); text-decoration: none; font-size: .72rem; letter-spacing: .3em; text-transform: uppercase; display: flex; flex-direction: column; align-items: center; gap: 10px; z-index: 3; }
    .scroll-cue i { width: 24px; height: 40px; border: 2px solid var(--g-400); border-radius: 14px; position: relative; }
    .scroll-cue i::after { content: ''; position: absolute; left: 50%; top: 7px; width: 4px; height: 8px; margin-left: -2px; border-radius: 2px; background: var(--g-400); animation: wheel 1.8s infinite; }
    @keyframes wheel { to { transform: translateY(14px); opacity: 0; } }

    /* ---------- Marquee ---------- */
    .marquee { background: var(--gold-grad); overflow: hidden; padding: 16px 0; position: relative; z-index: 2; }
    .track { display: flex; gap: 34px; width: max-content; animation: marquee 32s linear infinite; }
    .track span { font-family: var(--font-head); font-size: 1.35rem; font-weight: 700; color: var(--m-900); white-space: nowrap; }
    .track b { color: var(--m-600); }
    @keyframes marquee { to { transform: translateX(-50%); } }

    /* ---------- Stats ---------- */
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: -1px; background: #fff; border-radius: 0 0 24px 24px; box-shadow: var(--shadow); position: relative; z-index: 2; }
    .stat { padding: 38px 24px; text-align: center; border-right: 1px solid var(--line); }
    .stat:last-child { border-right: 0; }
    .stat strong { display: block; font-family: 'Playfair Display', serif; font-size: 3.2rem; line-height: 1; background: var(--maroon-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .stat small { display: block; margin-top: 10px; color: var(--muted); font-size: .9rem; }

    /* ---------- About teaser ---------- */
    .about-grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 80px; align-items: center; }
    .about-img { position: relative; }
    .img-wrap { border-radius: 24px; overflow: hidden; aspect-ratio: 4/5; box-shadow: var(--shadow); position: relative; }
    .img-wrap::after { content: ''; position: absolute; inset: 14px; border: 1.5px solid rgba(245,210,122,.7); border-radius: 16px; pointer-events: none; }
    .img-wrap img { width: 100%; height: 115%; object-fit: cover; object-position: top; }
    .float-card { position: absolute; right: -30px; bottom: 40px; display: flex; gap: 12px; align-items: center; background: #fff; padding: 14px 20px 14px 14px; border-radius: 16px; box-shadow: var(--shadow); border-left: 4px solid var(--g-500); }
    .float-card img { width: 50px; height: 50px; border-radius: 50%; }
    .float-card b { display: block; color: var(--m-800); font-family: var(--font-head); }
    .float-card small { color: var(--muted); }
    .about .btn { margin-top: 10px; }

    /* ---------- Initiatives ---------- */
    .init { background: var(--cream-2); }
    .init-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
    .init-card { position: relative; background: #fff; padding: 38px 32px; border-radius: 20px; overflow: hidden; border: 1px solid var(--line); transition: transform .5s var(--ease), box-shadow .5s var(--ease); isolation: isolate; }
    .init-card::before { content: ''; position: absolute; inset: 0; z-index: -1; background: var(--maroon-grad); transform: scaleY(0); transform-origin: bottom; transition: transform .6s var(--ease); }
    .init-card:hover { transform: translateY(-10px); box-shadow: var(--shadow); }
    .init-card:hover::before { transform: scaleY(1); }
    .init-card:hover h3 { color: var(--g-300); }
    .init-card:hover p { color: rgba(255,255,255,.8); }
    .init-card .num { position: absolute; top: 18px; right: 24px; font-family: 'Playfair Display', serif; font-size: 3.4rem; font-weight: 800; color: rgba(122,11,22,.07); transition: color .5s; }
    .init-card:hover .num { color: rgba(245,210,122,.18); }
    .ic { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; background: var(--gold-grad); color: var(--m-800); margin-bottom: 22px; transition: transform .6s var(--ease); }
    .ic app-icon { width: 30px; height: 30px; }
    .init-card:hover .ic { transform: rotateY(180deg); }
    .init-card h3 { font-size: 1.35rem; transition: color .4s; }
    .init-card p { color: var(--muted); margin: 0; transition: color .4s; }

    /* ---------- Quote band ---------- */
    .quote-band { position: relative; overflow: hidden; padding: 110px 0; color: #fff; background: var(--m-900); }
    .qb-bg { position: absolute; inset: -30% 0;
      background: repeating-conic-gradient(from 0deg at 30% 50%, rgba(245,210,122,.06) 0deg 6deg, transparent 6deg 18deg),
                  radial-gradient(ellipse at 30% 50%, #8a101d 0%, #4a050d 55%, #240205 100%); }
    /* Portrait photo shown whole in a frame (a full-width background would crop the face) */
    .qb-in { position: relative; display: grid; grid-template-columns: minmax(260px, 400px) 1fr; gap: 70px; align-items: center; }
    .qb-photo { margin: 0; aspect-ratio: 4 / 5; border-radius: 26px; padding: 5px; background: var(--gold-grad); box-shadow: 0 40px 80px -30px rgba(0,0,0,.7); }
    .qb-photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; border-radius: 22px; display: block; }
    .qmark { width: 60px; height: 60px; color: var(--g-500); margin-bottom: 20px; }
    blockquote { margin: 0; font-family: var(--font-head); font-size: clamp(1.6rem, 3.2vw, 2.6rem); line-height: 1.4; }
    cite { display: block; margin-top: 24px; color: var(--g-400); font-style: normal; letter-spacing: .15em; text-transform: uppercase; font-size: .85rem; }

    /* ---------- Gallery strip ---------- */
    .strip { padding-top: 0; }
    .strip-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; gap: 16px; flex-wrap: wrap; }
    .strip-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .ph-tile { position: relative; aspect-ratio: 1; border-radius: 18px; overflow: hidden; display: block; }
    .ph-tile img { width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform 1.2s var(--ease); }
    .ph-tile span { position: absolute; inset: auto 0 0; padding: 40px 18px 16px; color: #fff; background: linear-gradient(transparent, rgba(36,2,5,.9)); transform: translateY(100%); transition: transform .5s var(--ease); }
    .ph-tile:hover img { transform: scale(1.12) rotate(1deg); }
    .ph-tile:hover span { transform: none; }

    /* ---------- CTA ---------- */
    .cta { padding: 0 0 100px; }
    .cta-in { display: flex; justify-content: space-between; align-items: center; gap: 30px; flex-wrap: wrap; padding: 56px 60px; border-radius: 28px; background: var(--maroon-grad); color: #fff; position: relative; overflow: hidden; box-shadow: var(--shadow); }
    .cta-in::before { content: ''; position: absolute; width: 380px; height: 380px; right: -120px; top: -160px; border-radius: 50%; border: 50px solid rgba(245,210,122,.08); }
    .cta h2 { color: #fff; font-size: clamp(1.7rem, 3vw, 2.4rem); }
    .cta p { color: rgba(255,255,255,.8); margin: 0; }
    .cta-btns { display: flex; gap: 12px; flex-wrap: wrap; position: relative; }

    @media (max-width: 960px) {
      .hero { min-height: 100vh; }
      .slide { padding: 0; }
      .slide-in { grid-template-columns: 1fr; text-align: center; gap: 18px; padding-top: 84px; padding-bottom: 60px; }
      .kicker { margin-bottom: 8px; font-size: .7rem; }
      .hero h1 { margin-bottom: 12px; }
      .hero p { margin-inline: auto; font-size: 1rem; }
      .ctas { justify-content: center; margin-top: 18px; }
      .ctas .btn { padding: 12px 22px; }
      .visual { width: min(200px, 48vw); order: -1; }
      .orbit { inset: -14px; }
      .dots { bottom: 18px; }
      .badge { width: 70px; height: 70px; left: -16px; }
      .scroll-cue { display: none; }
      .qb-in { grid-template-columns: 1fr; gap: 36px; text-align: center; }
      .qb-photo { width: min(300px, 72vw); margin-inline: auto; }
      .qmark { margin-inline: auto; }
      .stats { grid-template-columns: repeat(2, 1fr); }
      .stat:nth-child(2) { border-right: 0; }
      .stat:nth-child(-n+2) { border-bottom: 1px solid var(--line); }
      .about-grid { grid-template-columns: 1fr; gap: 50px; }
      .float-card { right: 10px; }
      .init-grid { grid-template-columns: 1fr 1fr; }
      .cta-in { padding: 40px 28px; }
    }
    @media (max-width: 640px) {
      .stat strong { font-size: 2.3rem; }
      .stat { padding: 22px 10px; }
      .stat small { font-size: .8rem; line-height: 1.4; }
      .hero h1 { font-size: 2.2rem; }
      .init-card { padding: 28px 22px; }
      .about-grid { gap: 36px; }
      .img-wrap { aspect-ratio: 1 / 1.05; }
      .float-card { right: -8px; bottom: 18px; padding: 10px 14px 10px 10px; }
      .float-card img { width: 40px; height: 40px; }
      .quote-band { padding: 70px 0; }
      .qmark { width: 44px; height: 44px; }
      /* Photos: tidy 2-column grid, first four only. */
      .strip-head { margin-bottom: 18px; }
      .strip-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
      .ph-tile { border-radius: 14px; }
      .ph-tile:nth-child(n+5) { display: none; }
      .ph-tile span { transform: none; padding: 30px 10px 8px; font-size: .78rem; }
      .cta { padding-bottom: 70px; }
      .cta-in { padding: 34px 22px; border-radius: 22px; text-align: center; }
      .cta-btns { width: 100%; flex-direction: column; }
      .cta-btns .btn { width: 100%; }
    }
  `],
})
export class HomeComponent implements OnInit, OnDestroy {
  readonly lang = inject(LangService);
  private api = inject(ApiService);

  readonly slides = [
    { key: 'hero.s1', img: 'img/portrait.jpg', round: false },
    { key: 'hero.s2', img: 'img/office.jpg', round: false },
    { key: 'hero.s3', img: 'img/logo.jpg', round: true },
  ];
  readonly initiatives = [
    { n: 1, icon: 'skill' }, { n: 2, icon: 'school' }, { n: 3, icon: 'briefcase' },
    { n: 4, icon: 'store' }, { n: 5, icon: 'plane' }, { n: 6, icon: 'house' },
  ];
  readonly current = signal(0);
  readonly posts = signal<Post[] | null>(null);
  readonly photos = signal<GalleryItem[]>([]);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.start();
    this.api.posts(undefined, undefined, 0, 3).subscribe({ next: p => this.posts.set(p.items), error: () => this.posts.set([]) });
    this.api.gallery().subscribe({ next: g => this.photos.set(g.slice(0, 8)), error: () => {} });
  }

  go(i: number) { this.current.set(i); this.start(); }

  private start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.current.set((this.current() + 1) % this.slides.length), 6500);
  }

  ngOnDestroy() { clearInterval(this.timer); }
}
