import { Component, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LangService, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { DISTRICTS, ENQUIRY_TYPES } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { RevealDirective } from '../core/motion';
import { errMsg } from '../core/auth.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, AsyncPipe, RouterLink, TPipe, IconComponent, RevealDirective],
  template: `
  <section class="page-banner">
    <div class="container">
      <div class="crumbs"><a routerLink="/">{{ 'nav.home' | t }}</a> / {{ 'nav.contact' | t }}</div>
      <h1>{{ 'nav.contact' | t }}</h1>
      <p class="lead">{{ 'contact.lead' | t }}</p>
    </div>
  </section>

  <!-- How it works -->
  <section class="container steps">
    @for (n of [1, 2, 3]; track n; let i = $index) {
      <div class="step" appReveal="up" [delay]="i * 140">
        <span class="n">{{ n }}</span>
        <div><b>{{ 'contact.step' + n | t }}</b><small>{{ 'contact.step' + n + '.d' | t }}</small></div>
      </div>
    }
  </section>

  <section class="section">
    <div class="container grid">
      <!-- Info -->
      <aside class="info" appReveal="left">
        @if (settings$ | async; as s) {
          <a class="info-card" [href]="'tel:+91' + s['phone']">
            <span class="ic"><app-icon name="phone" /></span>
            <div><small>{{ 'contact.phone' | t }}</small><b>+91 {{ s['phone'] }}</b></div>
          </a>
          <a class="info-card wa" [href]="'https://wa.me/' + s['whatsapp']" target="_blank" rel="noopener">
            <span class="ic"><app-icon name="whatsapp" /></span>
            <div><small>{{ 'contact.whatsapp' | t }}</small><b>+{{ s['whatsapp'] }}</b></div>
          </a>
          <a class="info-card wide" [href]="'mailto:' + s['email']">
            <span class="ic"><app-icon name="mail" /></span>
            <div><small>{{ 'contact.email' | t }}</small><b>{{ s['email'] }}</b></div>
          </a>
          <div class="info-card wide">
            <span class="ic"><app-icon name="pin" /></span>
            <div><small>{{ 'contact.address' | t }}</small><b>{{ lang.lang() === 'kn' ? s['addressKn'] : s['addressEn'] }}</b></div>
          </div>
          @if (s['youtube']) {
            <a class="info-card wide yt" [href]="s['youtube']" target="_blank" rel="noopener">
              <span class="ic"><app-icon name="youtube" /></span>
              <div><small>{{ 'contact.youtube' | t }}</small><b>{{ '@' + (s['youtube'].split('@')[1] || 'YouTube') }}</b></div>
            </a>
          }
          @if (s['officeHours']) {
            <div class="info-card wide">
              <span class="ic"><app-icon name="clock" /></span>
              <div><small>{{ 'contact.hours' | t }}</small><b>{{ s['officeHours'] }}</b></div>
            </div>
          }
        }
        @if (mapUrl$ | async; as url) {
          <div class="map"><iframe [src]="url" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map"></iframe></div>
        }
      </aside>

      <!-- Form -->
      <div class="form-card" appReveal="right">
        @if (done(); as d) {
          <div class="success">
            <div class="tick"><app-icon name="check" /></div>
            <h2>{{ 'send.ok.title' | t }}</h2>
            <p>{{ 'send.ok.ref' | t }}</p>
            <div class="ref">#{{ d.id }}</div>
            @if (d.whatsappUrl) {
              <p class="muted">{{ 'send.ok.wa' | t }}</p>
              <a class="btn btn-wa" [href]="d.whatsappUrl" target="_blank" rel="noopener"><app-icon name="whatsapp" /> {{ 'send.ok.waAgain' | t }}</a>
            } @else {
              <p class="muted">{{ 'send.ok.email' | t }}</p>
            }
            <button class="btn btn-maroon" (click)="reset()">{{ 'send.another' | t }}</button>
          </div>
        } @else {
          <h2>{{ 'contact.form.title' | t }}</h2>
          <form [formGroup]="form" (ngSubmit)="$event.preventDefault()" novalidate>
            <div class="row">
              <div class="field">
                <label for="c-name">{{ 'f.name' | t }} <span class="req">*</span></label>
                <input id="c-name" class="input" formControlName="name" autocomplete="name" [class.invalid]="bad('name')">
                @if (bad('name')) { <span class="err">{{ 'f.required' | t }}</span> }
              </div>
              <div class="field">
                <label for="c-phone">{{ 'f.phone' | t }} <span class="req">*</span></label>
                <input id="c-phone" class="input" formControlName="phone" inputmode="tel" autocomplete="tel" maxlength="14" placeholder="98XXXXXXXX" [class.invalid]="bad('phone')">
                @if (bad('phone')) { <span class="err">{{ 'f.badPhone' | t }}</span> }
              </div>
            </div>
            <div class="row">
              <div class="field">
                <label for="c-email">{{ 'f.email' | t }}</label>
                <input id="c-email" class="input" type="email" formControlName="email" autocomplete="email" [class.invalid]="bad('email')">
                @if (bad('email')) { <span class="err">{{ 'f.badEmail' | t }}</span> }
              </div>
              <div class="field">
                <label for="c-type">{{ 'f.type' | t }}</label>
                <select id="c-type" class="input" formControlName="type">
                  @for (ty of types; track ty) { <option [value]="ty">{{ 'type.' + ty | t }}</option> }
                </select>
              </div>
            </div>
            <div class="row">
              <div class="field">
                <label for="c-dist">{{ 'f.district' | t }}</label>
                <select id="c-dist" class="input" formControlName="district">
                  <option value="">{{ 'f.district.pick' | t }}</option>
                  @for (d of districts; track d.en) { <option [value]="d.en">{{ lang.lang() === 'kn' ? d.kn : d.en }}</option> }
                  <option value="Outside Karnataka">{{ 'f.district.other' | t }}</option>
                </select>
              </div>
              <div class="field">
                <label for="c-taluk">{{ 'f.taluk' | t }}</label>
                <input id="c-taluk" class="input" formControlName="taluk">
              </div>
            </div>
            <div class="field">
              <label for="c-sub">{{ 'f.subject' | t }}</label>
              <input id="c-sub" class="input" formControlName="subject" maxlength="200">
            </div>
            <div class="field">
              <label for="c-msg">{{ 'f.message' | t }} <span class="req">*</span></label>
              <textarea id="c-msg" class="input" formControlName="message" rows="5" maxlength="4000" [class.invalid]="bad('message')"></textarea>
              @if (bad('message')) { <span class="err">{{ 'f.required' | t }}</span> }
            </div>
            <!-- Honeypot: hidden from people, filled by bots -->
            <input class="hp" formControlName="website" tabindex="-1" autocomplete="off" aria-hidden="true">

            @if (error()) { <p class="err big">{{ error() }}</p> }

            <div class="send">
              <button type="button" class="btn btn-maroon" [disabled]="busy()" (click)="submit('email')">
                <app-icon name="mail" /> {{ (busy() === 'email' ? 'send.sending' : 'send.email') | t }}
              </button>
              <button type="button" class="btn btn-wa" [disabled]="busy()" (click)="submit('whatsapp')">
                <app-icon name="whatsapp" /> {{ (busy() === 'whatsapp' ? 'send.sending' : 'send.whatsapp') | t }}
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  </section>
  `,
  styles: [`
    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin-top: -50px; position: relative; z-index: 2; background: #fff; border-radius: 20px; box-shadow: var(--shadow); overflow: hidden; }
    .step { display: flex; gap: 16px; align-items: center; padding: 26px 28px; border-right: 1px solid var(--line); }
    .step:last-child { border-right: 0; }
    .step .n { width: 48px; height: 48px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--gold-grad); color: var(--m-900); font-weight: 700; font-size: 1.2rem; }
    .step b { display: block; color: var(--m-800); }
    .step small { color: var(--muted); }

    .grid { display: grid; grid-template-columns: .85fr 1.15fr; gap: 40px; align-items: start; }
    .info { display: grid; gap: 14px; }
    .info-card { display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: 16px; background: #fff; border: 1px solid var(--line); text-decoration: none; color: inherit; transition: transform .4s var(--ease), box-shadow .4s var(--ease), border-color .4s; }
    a.info-card:hover { transform: translateX(8px); box-shadow: var(--shadow); border-color: var(--g-500); }
    .info-card .ic { width: 52px; height: 52px; flex: none; border-radius: 14px; display: grid; place-items: center; background: var(--maroon-grad); color: var(--g-300); }
    .info-card.wa .ic { background: linear-gradient(135deg, #2bd46a, #128c4b); color: #fff; }
    .info-card.yt .ic { background: #ff0000; color: #fff; }
    .info-card small { display: block; color: var(--g-700); text-transform: uppercase; letter-spacing: .1em; font-size: .72rem; font-weight: 600; }
    .info-card b { color: var(--m-900); font-weight: 600; word-break: break-word; }
    .map { border-radius: 16px; overflow: hidden; border: 1px solid var(--line); height: 260px; }
    .map iframe { width: 100%; height: 100%; border: 0; filter: sepia(.25) saturate(1.1); }

    .form-card { background: #fff; border-radius: 24px; padding: 40px; border: 1px solid var(--line); box-shadow: var(--shadow); position: relative; overflow: hidden; }
    .form-card::before { content: ''; position: absolute; inset: 0 0 auto; height: 5px; background: var(--gold-grad); }
    .form-card h2 { font-size: 1.7rem; margin-bottom: 24px; }
    form { display: grid; gap: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .send { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
    .send .btn { flex: 1 1 220px; }
    .err.big { margin: 0; font-size: .95rem; }

    .success { text-align: center; padding: 20px 0; animation: rise .8s var(--ease) both; }
    .tick { width: 90px; height: 90px; border-radius: 50%; margin: 0 auto 20px; display: grid; place-items: center; background: var(--gold-grad); color: var(--m-800); animation: pop .7s var(--ease) both .1s; }
    .tick app-icon { width: 46px; height: 46px; }
    @keyframes pop { from { transform: scale(0) rotate(-90deg); } }
    .ref { font-family: 'Playfair Display', serif; font-size: 3rem; font-weight: 800; color: var(--m-700); margin: -6px 0 16px; }
    .muted { color: var(--muted); }
    .success .btn { margin: 8px 6px 0; }

    /* Phones: contact details as a 2-up grid of tiles; long ones (email, address) full width. */
    @media (max-width: 640px) {
      .steps { margin-top: -36px; }
      .step { padding: 16px 18px; gap: 12px; }
      .step .n { width: 38px; height: 38px; font-size: 1rem; }
      .info { grid-template-columns: 1fr 1fr; gap: 10px; }
      .info-card { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; }
      .info-card.wide, .map { grid-column: 1 / -1; }
      .info-card.wide { flex-direction: row; align-items: center; }
      a.info-card:hover { transform: none; }
      .info-card .ic { width: 42px; height: 42px; border-radius: 12px; }
      .info-card b { font-size: .92rem; }
      .map { height: 200px; }
      .form-card h2 { font-size: 1.4rem; }
    }
    @media (max-width: 900px) {
      .steps { grid-template-columns: 1fr; }
      .step { border-right: 0; border-bottom: 1px solid var(--line); }
      .grid { grid-template-columns: 1fr; }
      .form-card { padding: 28px 20px; }
      .row { grid-template-columns: 1fr; }
    }
  `],
})
export class ContactComponent {
  readonly lang = inject(LangService);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);

  readonly settings$ = this.api.settings();
  readonly mapUrl$ = this.settings$.pipe(map(s => s['mapQuery']
    ? this.sanitizer.bypassSecurityTrustResourceUrl('https://www.google.com/maps?q=' + encodeURIComponent(s['mapQuery']) + '&output=embed')
    : null as SafeResourceUrl | null));
  readonly districts = DISTRICTS;
  readonly types = ENQUIRY_TYPES;
  readonly busy = signal<'' | 'email' | 'whatsapp'>('');
  readonly error = signal('');
  readonly done = signal<{ id: number; whatsappUrl?: string } | null>(null);
  private tried = false;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', [Validators.required, Validators.pattern(/^(\+?91[\s-]?)?0?[6-9]\d{9}$/)]],
    email: ['', [Validators.email]],
    type: ['query'],
    district: [''],
    taluk: [''],
    subject: [''],
    message: ['', [Validators.required, Validators.maxLength(4000)]],
    website: [''],
  });

  bad(name: string) {
    const c = this.form.get(name)!;
    return c.invalid && (c.touched || this.tried);
  }

  submit(channel: 'email' | 'whatsapp') {
    this.tried = true;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    // Open the WhatsApp tab synchronously so pop-up blockers allow it; point it at the chat once saved.
    const waTab = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    this.busy.set(channel);
    this.api.enquire({ ...this.form.getRawValue(), channel, lang: this.lang.lang() }).subscribe({
      next: r => {
        this.busy.set('');
        this.done.set(r);
        if (r.whatsappUrl) {
          if (waTab) waTab.location.href = r.whatsappUrl;
          else window.open(r.whatsappUrl, '_blank');
        }
        scrollTo({ top: 300, behavior: 'smooth' });
      },
      error: e => {
        waTab?.close();
        this.busy.set('');
        this.error.set(errMsg(e, this.lang.t('send.fail')));
      },
    });
  }

  reset() {
    this.tried = false;
    this.form.reset({ type: 'query' });
    this.done.set(null);
  }
}
