import { TestBed } from '@angular/core/testing';
import { LangService, LocPipe, TPipe } from './lang.service';

describe('LangService', () => {
  beforeEach(() => {
    localStorage.removeItem('hf-lang');
    document.documentElement.classList.remove('lang-kn');
  });
  afterEach(() => localStorage.removeItem('hf-lang'));

  function create() {
    TestBed.resetTestingModule();
    return TestBed.inject(LangService);
  }

  it('defaults to English', () => {
    const s = create();
    expect(s.lang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.classList.contains('lang-kn')).toBeFalse();
  });

  it('toggles to Kannada, switches fonts class and remembers the choice', () => {
    const s = create();
    s.toggle();
    expect(s.lang()).toBe('kn');
    expect(document.documentElement.lang).toBe('kn');
    expect(document.documentElement.classList.contains('lang-kn')).toBeTrue();
    expect(localStorage.getItem('hf-lang')).toBe('kn');
    s.toggle();
    expect(s.lang()).toBe('en');
    expect(localStorage.getItem('hf-lang')).toBe('en');
  });

  it('restores the saved language on next visit', () => {
    localStorage.setItem('hf-lang', 'kn');
    expect(create().lang()).toBe('kn');
  });

  it('translates keys and falls back to the key itself', () => {
    const s = create();
    expect(s.t('nav.home')).toBe('Home');
    s.set('kn');
    expect(s.t('nav.home')).toBe('ಮುಖಪುಟ');
    expect(s.t('no.such.key')).toBe('no.such.key');
  });

  it('pick() chooses the Kannada field, falling back to English when empty', () => {
    const s = create();
    const post = { titleEn: 'Job Mela', titleKn: 'ಉದ್ಯೋಗ ಮೇಳ', bodyEn: 'Body', bodyKn: '' };
    expect(s.pick(post, 'title')).toBe('Job Mela');
    s.set('kn');
    expect(s.pick(post, 'title')).toBe('ಉದ್ಯೋಗ ಮೇಳ');
    expect(s.pick(post, 'body')).toBe('Body');
    expect(s.pick(null, 'title')).toBe('');
    expect(s.pick({}, 'title')).toBe('');
  });

  it('pipes follow the current language', () => {
    const s = create();
    const t = TestBed.runInInjectionContext(() => new TPipe());
    const loc = TestBed.runInInjectionContext(() => new LocPipe());
    expect(t.transform('nav.contact')).toBe('Contact Us');
    expect(loc.transform({ captionEn: 'Rally', captionKn: 'ರ‍್ಯಾಲಿ' }, 'caption')).toBe('Rally');
    s.set('kn');
    expect(t.transform('nav.contact')).toBe('ಸಂಪರ್ಕಿಸಿ');
    expect(loc.transform({ captionEn: 'Rally', captionKn: 'ರ‍್ಯಾಲಿ' }, 'caption')).toBe('ರ‍್ಯಾಲಿ');
  });
});
