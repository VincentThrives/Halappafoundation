import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { TimelineComponent } from './timeline.component';
import { PostsListComponent } from './posts-list.component';
import { GalleryComponent } from './gallery.component';
import { HomeComponent } from './home.component';
import { AboutComponent } from './about.component';
import { LangService } from '../core/lang.service';
import { apiStub, provideApiStub, stubIntersectionObserver } from '../testing';

function base(api = apiStub(), route?: object) {
  localStorage.removeItem('hf-lang');
  stubIntersectionObserver();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideApiStub(api), ...(route ? [{ provide: ActivatedRoute, useValue: route }] : [])],
  });
  TestBed.inject(LangService).set('en');
  return api;
}

describe('Timeline page', () => {
  it('lists milestones from the server', () => {
    const api = base();
    api.timeline.and.returnValue(of([
      { id: 1, period: 'Present', titleEn: 'Vice President, KPCC', titleKn: 'ಉಪಾಧ್ಯಕ್ಷರು' },
      { id: 2, period: '2015', titleEn: 'Chairman' },
    ]));
    const f = TestBed.createComponent(TimelineComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('ol.tl li').length).toBe(2);
    expect(f.nativeElement.querySelector('ol.tl li.right')).toBeTruthy();
  });

  it('translates period labels in Kannada but keeps years', () => {
    base();
    const c = TestBed.createComponent(TimelineComponent).componentInstance;
    expect(c.period('Present')).toBe('Present');
    TestBed.inject(LangService).set('kn');
    expect(c.period('Present')).toBe('ಪ್ರಸ್ತುತ');
    expect(c.period('past')).toBe('ಹಿಂದಿನ');
    expect(c.period('12+ years')).toBe('12+ ವರ್ಷಗಳು');
    expect(c.period('2015')).toBe('2015');
  });

  it('shows a friendly message when empty', () => {
    base();
    const f = TestBed.createComponent(TimelineComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.empty')).toBeTruthy();
  });
});

describe('Press / My Views / Stalwart Says list', () => {
  const posts = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({
    id: start + i + 1, section: 'press', category: 'news', titleEn: 'Post ' + (start + i + 1), bodyEn: 'Body', publishedOn: '2026-09-01',
  }));

  it('Press shows five category tabs and loads the chosen one', () => {
    const api = base(apiStub(), { data: of({ section: 'press' }), paramMap: of(convertToParamMap({ category: 'news' })) });
    api.posts.and.returnValue(of({ items: posts(2), total: 2, page: 0, size: 12 }));
    const f = TestBed.createComponent(PostsListComponent);
    f.detectChanges();
    expect(api.posts).toHaveBeenCalledWith('press', 'news', 0, 12);
    expect(f.nativeElement.querySelectorAll('.tabs a').length).toBe(5);
    expect(f.nativeElement.querySelectorAll('.post-card').length).toBe(2);
    expect(f.nativeElement.querySelector('h1').textContent).toContain('News');
  });

  it('Stalwart Says has no tabs and uses quote cards', () => {
    const api = base(apiStub(), { data: of({ section: 'stalwart' }), paramMap: of(convertToParamMap({})) });
    api.posts.and.returnValue(of({ items: [{ id: 1, section: 'stalwart', category: 'stalwart', titleEn: 'Former Minister', bodyEn: 'A true leader.', author: 'Mr X' }], total: 1, page: 0, size: 12 }));
    const f = TestBed.createComponent(PostsListComponent);
    f.detectChanges();
    expect(api.posts).toHaveBeenCalledWith('stalwart', 'stalwart', 0, 12);
    expect(f.nativeElement.querySelector('.tabs')).toBeNull();
    expect(f.nativeElement.querySelector('.q-card .q-text').textContent).toContain('A true leader.');
    expect(f.nativeElement.querySelector('.q-by').textContent).toContain('Mr X');
  });

  it('"Load more" fetches the next page and appends', () => {
    const api = base(apiStub(), { data: of({ section: 'views' }), paramMap: of(convertToParamMap({ category: 'articles' })) });
    api.posts.and.returnValues(of({ items: posts(12), total: 14, page: 0, size: 12 }), of({ items: posts(2, 12), total: 14, page: 1, size: 12 }));
    const f = TestBed.createComponent(PostsListComponent);
    f.detectChanges();
    f.nativeElement.querySelector('.more-wrap button').click();
    f.detectChanges();
    expect(api.posts.calls.mostRecent().args).toEqual(['views', 'articles', 1, 12]);
    expect(f.nativeElement.querySelectorAll('.post-card').length).toBe(14);
    expect(f.nativeElement.querySelector('.more-wrap')).toBeNull();
  });

  it('empty category shows the "coming soon" message', () => {
    base(apiStub(), { data: of({ section: 'press' }), paramMap: of(convertToParamMap({ category: 'critic' })) });
    const f = TestBed.createComponent(PostsListComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.empty').textContent).toContain('New updates will appear here soon');
  });
});

describe('Gallery page', () => {
  const photos = [
    { id: 1, category: 'election-rally', captionEn: 'Rally', image: '/a.jpg' },
    { id: 2, category: 'election-rally', captionEn: 'Crowd', image: '/b.jpg' },
    { id: 3, category: 'election-rally', captionEn: 'Stage', image: '/c.jpg' },
  ];

  it('filters by album and opens the lightbox with keyboard navigation', () => {
    const params = new BehaviorSubject(convertToParamMap({ category: 'election-rally' }));
    const api = base(apiStub(), { paramMap: params });
    api.gallery.and.returnValue(of(photos));
    const f = TestBed.createComponent(GalleryComponent);
    f.detectChanges();
    expect(api.gallery).toHaveBeenCalledWith('election-rally');
    const tiles = f.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(3);

    tiles[0].click(); f.detectChanges();
    expect(f.nativeElement.querySelector('.lb figure img').getAttribute('src')).toBe('/a.jpg');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); f.detectChanges();
    expect(f.nativeElement.querySelector('.lb figure img').getAttribute('src')).toBe('/c.jpg'); // wraps around
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); f.detectChanges();
    expect(f.nativeElement.querySelector('.count').textContent).toContain('1 / 3');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); f.detectChanges();
    expect(f.nativeElement.querySelector('.lb')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('"All" loads every album', () => {
    const api = base(apiStub(), { paramMap: of(convertToParamMap({})) });
    TestBed.createComponent(GalleryComponent).detectChanges();
    expect(api.gallery).toHaveBeenCalledWith(undefined);
  });
});

describe('Home page', () => {
  it('rotates the hero slides every 6.5 s and dots jump to a slide', fakeAsync(() => {
    base();
    const f = TestBed.createComponent(HomeComponent);
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.current()).toBe(0);
    tick(6500);
    expect(c.current()).toBe(1);
    tick(6500);
    expect(c.current()).toBe(2);
    tick(6500);
    expect(c.current()).toBe(0);
    c.go(2);
    expect(c.current()).toBe(2);
    f.destroy();
    discardPeriodicTasks();
  }));

  it('loads the 3 latest posts and gallery photos', fakeAsync(() => {
    const api = base();
    const f = TestBed.createComponent(HomeComponent);
    f.detectChanges();
    expect(api.posts).toHaveBeenCalledWith(undefined, undefined, 0, 3);
    expect(api.gallery).toHaveBeenCalled();
    expect(f.nativeElement.querySelectorAll('.init-card').length).toBe(6);
    f.destroy();
    discardPeriodicTasks();
  }));

  it('hero headline follows the language', fakeAsync(() => {
    base();
    const f = TestBed.createComponent(HomeComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.slide.active h1').textContent).toContain('Empowering youth.');
    TestBed.inject(LangService).set('kn');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.slide.active h1').textContent).toContain('ಯುವಜನರ ಸಬಲೀಕರಣ.');
    f.destroy();
    discardPeriodicTasks();
  }));
});

describe('About page', () => {
  it('shows 6 present and 3 past positions from the bio, and community reach', () => {
    base();
    const f = TestBed.createComponent(AboutComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.pos').length).toBe(9);
    expect(f.nativeElement.querySelectorAll('.pos.past').length).toBe(3);
    expect(f.nativeElement.querySelectorAll('.ring').length).toBe(3);
    expect(f.nativeElement.textContent).toContain('Bangalore Institute of Technology');
  });
});
