import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { DICT } from './i18n';

export type Lang = 'en' | 'kn';

@Injectable({ providedIn: 'root' })
export class LangService {
  readonly lang = signal<Lang>(this.initial());

  constructor() { this.apply(this.lang()); }

  private initial(): Lang {
    try { return localStorage.getItem('hf-lang') === 'kn' ? 'kn' : 'en'; } catch { return 'en'; }
  }

  toggle() { this.set(this.lang() === 'en' ? 'kn' : 'en'); }

  set(l: Lang) {
    this.lang.set(l);
    this.apply(l);
    try { localStorage.setItem('hf-lang', l); } catch { /* private mode */ }
  }

  private apply(l: Lang) {
    const html = document.documentElement;
    html.lang = l === 'kn' ? 'kn' : 'en';
    html.classList.toggle('lang-kn', l === 'kn');
  }

  t(key: string): string {
    const e = DICT[key];
    return e ? e[this.lang()] : key;
  }

  /** Picks `<field>Kn` in Kannada (falling back to English) from a bilingual record. */
  pick(obj: any, field: string): string {
    if (!obj) return '';
    const kn = obj[field + 'Kn'];
    return this.lang() === 'kn' && kn ? kn : obj[field + 'En'] ?? '';
  }
}

/** {{ 'nav.home' | t }} */
@Pipe({ name: 't', standalone: true, pure: false })
export class TPipe implements PipeTransform {
  private lang = inject(LangService);
  transform(key: string): string { return this.lang.t(key); }
}

/** {{ post | loc:'title' }} picks titleKn / titleEn by current language. */
@Pipe({ name: 'loc', standalone: true, pure: false })
export class LocPipe implements PipeTransform {
  private lang = inject(LangService);
  transform(obj: any, field: string): string { return this.lang.pick(obj, field); }
}
