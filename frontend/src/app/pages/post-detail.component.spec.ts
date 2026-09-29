import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';
import { PostDetailComponent } from './post-detail.component';
import { NotFoundComponent } from './not-found.component';
import { AppComponent } from '../app.component';
import { LangService } from '../core/lang.service';
import { apiStub, provideApiStub, stubIntersectionObserver } from '../testing';
import { HeaderComponent } from '../layout/header.component';
import { SocialFloatComponent } from '../layout/social-float.component';

describe('Single post page', () => {
  function make(post: any, fail = false) {
    localStorage.removeItem('hf-lang');
    stubIntersectionObserver();
    const api = apiStub();
    api.post.and.returnValue(fail ? throwError(() => new Error('404')) : of(post));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideApiStub(api),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: '4' })) } }],
    });
    TestBed.inject(LangService).set('en');
    const f = TestBed.createComponent(PostDetailComponent);
    f.detectChanges();
    return { f, api };
  }

  const post = {
    id: 4, section: 'press', category: 'news', titleEn: 'Job Mela', titleKn: 'ಉದ್ಯೋಗ ಮೇಳ',
    bodyEn: 'Para one.\n\nPara two.', bodyKn: 'ಮೊದಲ.\n\nಎರಡನೇ.', author: 'Staff', image: '/uploads/a.png',
    sourceUrl: 'https://news.example/a', publishedOn: '2026-09-20',
  };

  it('loads the post by id and shows each paragraph, image, author and source link', () => {
    const { f, api } = make(post);
    expect(api.post).toHaveBeenCalledWith(4);
    expect(f.nativeElement.querySelector('h1').textContent).toContain('Job Mela');
    expect(f.nativeElement.querySelectorAll('.reader p').length).toBe(2);
    expect(f.nativeElement.querySelector('.hero-img').getAttribute('src')).toBe('/uploads/a.png');
    expect(f.nativeElement.querySelector('.lead').textContent).toContain('Staff');
    const src = f.nativeElement.querySelector('a[href="https://news.example/a"]');
    expect(src.getAttribute('rel')).toBe('noopener');
  });

  it('switches to Kannada text', () => {
    const { f } = make(post);
    TestBed.inject(LangService).set('kn');
    f.detectChanges();
    expect(f.nativeElement.querySelector('h1').textContent).toContain('ಉದ್ಯೋಗ ಮೇಳ');
    expect(f.nativeElement.querySelector('.reader p').textContent).toContain('ಮೊದಲ.');
  });

  it('shows "Page not found" for a missing post', () => {
    const { f } = make(null, true);
    expect(f.nativeElement.querySelector('.empty').textContent).toContain('Page not found');
  });

  it('Back goes to the previous page', () => {
    const { f } = make(post);
    const loc = TestBed.inject(Location);
    spyOn(loc, 'back');
    f.nativeElement.querySelector('.actions .btn-maroon').click();
    expect(loc.back).toHaveBeenCalled();
  });

  it('no image or source → neither is shown', () => {
    const { f } = make({ ...post, image: null, sourceUrl: null });
    expect(f.nativeElement.querySelector('.hero-img')).toBeNull();
    expect(f.nativeElement.querySelectorAll('.actions a').length).toBe(0);
  });
});

describe('404 page and app shell', () => {
  it('404 links home', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(NotFoundComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('h1').textContent).toBe('404');
    expect(f.nativeElement.querySelector('a').getAttribute('href')).toBe('/');
  });

  it('gold progress bar runs while a page loads', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'x', component: NotFoundComponent }])] });
    const f = TestBed.createComponent(AppComponent);
    f.detectChanges();
    const nav = TestBed.inject(Router).navigateByUrl('/x');
    expect(f.componentInstance.loading()).toBeTrue();
    await nav;
    expect(f.componentInstance.loading()).toBeFalse();
  });
});

describe('Scroll behaviour', () => {
  beforeEach(() => {
    stubIntersectionObserver();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideApiStub()] });
  });

  it('header turns solid after scrolling 60px', () => {
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    spyOnProperty(window, 'scrollY').and.returnValue(120);
    f.componentInstance.onScroll();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.hdr').classList.contains('solid')).toBeTrue();
  });

  it('back-to-top ring shows scroll progress and scrolls up', () => {
    const f = TestBed.createComponent(SocialFloatComponent);
    f.detectChanges();
    spyOnProperty(window, 'scrollY').and.returnValue(500);
    spyOnProperty(document.documentElement, 'scrollHeight').and.returnValue(1000 + innerHeight);
    f.componentInstance.onScroll();
    expect(f.componentInstance.progress()).toBeCloseTo(0.5, 2);
    const to = spyOn(window, 'scrollTo') as jasmine.Spy;
    f.componentInstance.top();
    expect(to.calls.mostRecent().args[0]).toEqual({ top: 0, behavior: 'smooth' });
  });
});
