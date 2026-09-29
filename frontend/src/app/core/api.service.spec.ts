import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService, toParams } from './api.service';
import { Settings } from './models';

describe('toParams', () => {
  it('drops empty values and joins arrays', () => {
    const p = toParams({ q: '', status: 'new', from: undefined, to: null, ids: [1, 2, 3], page: 0, all: true });
    expect(p.keys().sort()).toEqual(['all', 'ids', 'page', 'status']);
    expect(p.get('ids')).toBe('1,2,3');
    expect(p.get('page')).toBe('0');
    expect(p.get('all')).toBe('true');
  });
});

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads settings once and shares them', () => {
    let a: Settings | undefined, b: Settings | undefined;
    api.settings().subscribe(s => (a = s));
    api.settings().subscribe(s => (b = s));
    http.expectOne('/api/public/settings').flush({ phone: '1' });
    expect(a).toEqual({ phone: '1' });
    expect(b).toEqual({ phone: '1' });
  });

  it('retries settings and falls back to built-in contact details so the side bar never disappears', fakeAsync(() => {
    let got: Settings | undefined;
    api.settings().subscribe(s => (got = s));
    for (let i = 0; i < 4; i++) {
      http.expectOne('/api/public/settings').flush('down', { status: 500, statusText: 'err' });
      tick(1500);
    }
    expect(got?.['whatsapp']).toBe('919900123406');
    expect(got?.['email']).toBe('info@halappafoundation.in');
  }));

  it('requests posts with section, category and paging', () => {
    api.posts('press', 'news', 2, 12).subscribe();
    const req = http.expectOne(r => r.url === '/api/public/posts');
    expect(req.request.params.get('section')).toBe('press');
    expect(req.request.params.get('category')).toBe('news');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ items: [], total: 0, page: 2, size: 12 });
  });

  it('omits empty filters', () => {
    api.posts(undefined, undefined, 0, 3).subscribe();
    const req = http.expectOne(r => r.url === '/api/public/posts');
    expect(req.request.params.has('section')).toBeFalse();
    req.flush({ items: [], total: 0, page: 0, size: 3 });
  });

  it('posts enquiries to the public endpoint', () => {
    api.enquire({ name: 'A', channel: 'email' }).subscribe(r => expect(r.id).toBe(7));
    const req = http.expectOne('/api/public/enquiries');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.channel).toBe('email');
    req.flush({ id: 7 });
  });
});
