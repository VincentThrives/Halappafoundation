import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HeaderComponent } from './header.component';
import { SocialFloatComponent } from './social-float.component';
import { FooterComponent } from './footer.component';
import { LangService } from '../core/lang.service';
import { SETTINGS, apiStub, provideApiStub, stubIntersectionObserver } from '../testing';

function setup(settings = SETTINGS) {
  localStorage.removeItem('hf-lang');
  stubIntersectionObserver();
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideApiStub(apiStub(settings))] });
  const lang = TestBed.inject(LangService);
  lang.set('en');
  return lang;
}

describe('Header', () => {
  it('shows every main menu item with dropdown sub-pages', () => {
    setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    const nav = f.nativeElement.querySelector('nav.nav') as HTMLElement;
    const text = nav.textContent!;
    for (const item of ['Home', 'About', 'Stalwart Says', 'Press', 'My Views', 'Gallery', 'Timeline', 'Contact Us']) {
      expect(text).withContext(item).toContain(item);
    }
    const hrefs = [...nav.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/press/press-releases');
    expect(hrefs).toContain('/my-views/quotes');
    expect(hrefs).toContain('/gallery/spiritual-side');
  });

  it('has a Sign in button in the top bar and the phone menu', () => {
    setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    const links = [...f.nativeElement.querySelectorAll('a[href="/admin/login"]')] as HTMLElement[];
    expect(links.length).toBe(2);
    expect(links.every(l => l.textContent!.includes('Sign in'))).toBeTrue();
  });

  it('language menu offers ಕನ್ನಡ and English and switches the site', () => {
    const lang = setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    const options = [...f.nativeElement.querySelectorAll('.lang-menu button')] as HTMLButtonElement[];
    expect(options.map(o => o.querySelector('b')!.textContent)).toEqual(['ಕನ್ನಡ', 'English']);
    expect(options[1].classList.contains('on')).toBeTrue();

    options[0].click();
    f.detectChanges();
    expect(lang.lang()).toBe('kn');
    expect(f.componentInstance.langOpen()).toBeFalse();
    expect(f.nativeElement.querySelector('.lang span').textContent).toBe('ಕನ್ನಡ');
    expect(f.nativeElement.querySelector('nav.nav').textContent).toContain('ಮುಖಪುಟ');
    expect(options[0].classList.contains('on')).toBeTrue();
  });

  it('tapping the language button opens the menu (for touch screens)', () => {
    setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    f.nativeElement.querySelector('.lang').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.lang-dd').classList.contains('open')).toBeTrue();
  });

  it('burger opens and closes the phone menu', () => {
    setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    const burger = f.nativeElement.querySelector('.burger') as HTMLButtonElement;
    burger.click(); f.detectChanges();
    expect(f.nativeElement.querySelector('.drawer').classList.contains('show')).toBeTrue();
    burger.click(); f.detectChanges();
    expect(f.nativeElement.querySelector('.drawer').classList.contains('show')).toBeFalse();
  });

  it('shows phone and email from settings', () => {
    setup();
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href="tel:+919900123406"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('a[href="mailto:info@halappafoundation.in"]')).toBeTruthy();
  });
});

describe('Floating social bar', () => {
  it('always shows Mail, Facebook, WhatsApp and Instagram in that order', () => {
    setup();
    const f = TestBed.createComponent(SocialFloatComponent);
    f.detectChanges();
    const links = [...f.nativeElement.querySelectorAll('aside.float a')] as HTMLAnchorElement[];
    expect(links.map(l => l.className.trim())).toEqual(['mail', 'fb', 'wa', 'ig']);
    expect(links[0].getAttribute('href')).toBe('mailto:info@halappafoundation.in');
    expect(links[1].getAttribute('href')).toBe('https://facebook.com/halappafoundation');
    expect(links[1].target).toBe('_blank');
    expect(links[2].getAttribute('href')).toBe('https://wa.me/919900123406');
  });

  it('social buttons without a link yet point to the Contact page instead of disappearing', () => {
    setup({ ...SETTINGS, facebook: '', instagram: '' });
    const f = TestBed.createComponent(SocialFloatComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('a.fb').getAttribute('href')).toBe('/contact');
    expect(f.nativeElement.querySelector('a.ig').getAttribute('href')).toBe('/contact');
  });

  it('shows a YouTube button when the channel link is set', () => {
    setup({ ...SETTINGS, youtube: 'https://www.youtube.com/@muralidharhalappa' });
    const f = TestBed.createComponent(SocialFloatComponent);
    f.detectChanges();
    const yt = f.nativeElement.querySelector('aside.float a.yt') as HTMLAnchorElement;
    expect(yt.getAttribute('href')).toBe('https://www.youtube.com/@muralidharhalappa');
    expect(yt.target).toBe('_blank');
    expect(yt.textContent).toContain('YouTube');
  });

  it('back-to-top appears after scrolling', () => {
    setup();
    const f = TestBed.createComponent(SocialFloatComponent);
    f.componentInstance.progress.set(0.5);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.to-top').classList.contains('show')).toBeTrue();
  });
});

describe('Footer', () => {
  it('has Press, My Views and Gallery columns plus Admin sign in', () => {
    setup();
    const f = TestBed.createComponent(FooterComponent);
    f.detectChanges();
    const heads = [...f.nativeElement.querySelectorAll('h4')].map((h: any) => h.textContent);
    expect(heads).toEqual(['Press', 'My Views', 'Gallery']);
    expect(f.nativeElement.querySelector('a.signin').getAttribute('href')).toBe('/admin/login');
    expect(f.nativeElement.textContent).toContain(String(new Date().getFullYear()));
  });

  it('hides social icons that have no link', () => {
    setup({ ...SETTINGS, instagram: '', youtube: '' });
    const f = TestBed.createComponent(FooterComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.socials a[aria-label="Instagram"]')).toBeNull();
    expect(f.nativeElement.querySelector('.socials a[aria-label="Facebook"]')).toBeTruthy();
  });
});
