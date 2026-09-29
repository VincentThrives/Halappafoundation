import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse, HttpHeaders, HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { EnquiriesComponent } from './enquiries.component';
import { LoginComponent } from './login.component';
import { DashboardComponent } from './dashboard.component';
import { AuthService, adminGuard } from '../core/auth.service';
import { routes } from '../app.routes';
import { stubIntersectionObserver } from '../testing';

function adminApiStub() {
  const page = (total: number) => of({ items: [], total, page: 0, size: 25 });
  return {
    enquiries: jasmine.createSpy('enquiries').and.callFake((q: any, _p: number, size: number) =>
      page(size === 1 && q.from === '2026-08-01' ? 0 : 7)),
    exportEnquiries: jasmine.createSpy('exportEnquiries').and.returnValue(of({ blob: new Blob(['x']), name: 'f.xlsx' })),
    updateEnquiry: jasmine.createSpy('updateEnquiry').and.returnValue(of({})),
    deleteEnquiries: jasmine.createSpy('deleteEnquiries').and.returnValue(of({})),
    dashboard: jasmine.createSpy('dashboard').and.returnValue(of({
      enquiries: { total: 3, new: 2, 'in-progress': 0, resolved: 1, email: 2, whatsapp: 1 },
      posts: 6, photos: 2, timeline: 8, mailEnabled: false, whatsappApiEnabled: false,
    })),
  };
}

function setup(query: Record<string, string> = {}) {
  stubIntersectionObserver();
  const api = adminApiStub();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AdminApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    ],
  });
  return api;
}

// =====================================================================
describe('Admin: Excel download panel', () => {
  let f: ComponentFixture<EnquiriesComponent>;
  let c: EnquiriesComponent;
  let api: ReturnType<typeof adminApiStub>;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 8, 29, 11, 0)); // 29 Sep 2026
    api = setup();
    spyOn(HTMLAnchorElement.prototype, 'click'); // don't actually save files
    f = TestBed.createComponent(EnquiriesComponent);
    c = f.componentInstance;
    f.detectChanges();
  });
  afterEach(() => jasmine.clock().uninstall());

  it('defaults to "This month" (1st to today)', () => {
    expect(c.dl.from).toBe('2026-09-01');
    expect(c.dl.to).toBe('2026-09-29');
    expect(c.rangeCount()).toBe(7);
    expect(c.allCount()).toBe(7);
  });

  it('quick buttons set the right dates', () => {
    const cases: [string, string, string][] = [
      ['today', '2026-09-29', '2026-09-29'],
      ['7d', '2026-09-23', '2026-09-29'],
      ['month', '2026-09-01', '2026-09-29'],
      ['lastMonth', '2026-08-01', '2026-08-31'],
      ['year', '2026-01-01', '2026-09-29'],
    ];
    for (const [key, from, to] of cases) {
      c.preset(key);
      expect([c.dl.from, c.dl.to]).withContext(key).toEqual([from, to]);
    }
  });

  it('"Last month" handles January → December of the previous year', () => {
    jasmine.clock().mockDate(new Date(2027, 0, 10));
    c.preset('lastMonth');
    expect([c.dl.from, c.dl.to]).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('shows the live count and disables Download range when there is nothing to download', () => {
    c.preset('lastMonth'); // stub returns 0 for Aug
    f.detectChanges();
    const btn = f.nativeElement.querySelector('.dl-actions .btn-maroon') as HTMLButtonElement;
    expect(c.rangeCount()).toBe(0);
    expect(btn.disabled).toBeTrue();
    expect(btn.textContent).toContain('0');
  });

  it('From after To shows an error and disables the download', () => {
    c.dl.from = '2026-09-30';
    c.dl.to = '2026-09-01';
    c.countRange();
    f.detectChanges();
    expect(c.dlError()).toContain('From date must be on or before To date');
    expect((f.nativeElement.querySelector('.dl-actions .btn-maroon') as HTMLButtonElement).disabled).toBeTrue();
    c.downloadRange();
    expect(api.exportEnquiries).not.toHaveBeenCalled();
  });

  it('Download range sends dates, status and channel', () => {
    c.preset('7d');
    c.dl.status = 'new';
    c.dl.channel = 'whatsapp';
    c.downloadRange();
    expect(api.exportEnquiries).toHaveBeenCalledWith({ from: '2026-09-23', to: '2026-09-29', status: 'new', channel: 'whatsapp' });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('Download ALL ignores every filter', () => {
    c.downloadAll();
    expect(api.exportEnquiries).toHaveBeenCalledWith({}, undefined, true);
  });

  it('explains the range in words, both days included', () => {
    c.preset('month');
    expect(c.rangeText()).toBe('01-09-2026 to 29-09-2026 (both days included)');
    c.dl.from = ''; c.dl.to = '';
    expect(c.rangeText()).toContain('No dates chosen');
  });

  it('export failure shows an error message', () => {
    api.exportEnquiries.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Bad range' } })));
    c.downloadAll();
    f.detectChanges();
    expect(c.toast()).toBe('Bad range');
    expect(c.busy()).toBeFalse();
  });
});

describe('Admin: queries list', () => {
  it('opening from the dashboard with ?status=new pre-filters', () => {
    const api = setup({ status: 'new' });
    TestBed.createComponent(EnquiriesComponent).detectChanges();
    expect(api.enquiries.calls.first().args[0].status).toBe('new');
  });

  it('selecting rows and clicking WhatsApp passes the ids to Bulk WhatsApp', () => {
    setup();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const c = TestBed.createComponent(EnquiriesComponent).componentInstance;
    c.toggle(3); c.toggle(5);
    c.bulkWhatsApp();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/messages/new', { state: { ids: [3, 5], label: '2 selected enquiries' } });
  });

  it('with nothing selected, WhatsApp uses the current filters', () => {
    setup();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const f = TestBed.createComponent(EnquiriesComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.q.status = 'resolved';
    c.bulkWhatsApp();
    const state = (router.navigateByUrl as jasmine.Spy).calls.mostRecent().args[1].state;
    expect(state.filter.status).toBe('resolved');
  });

  it('waNum adds 91 to 10-digit numbers', () => {
    setup();
    const c = TestBed.createComponent(EnquiriesComponent).componentInstance;
    expect(c.waNum('9845012345')).toBe('919845012345');
    expect(c.waNum('+919845012345')).toBe('919845012345');
  });
});

// =====================================================================
describe('Admin: sign in page', () => {
  function make(loginResult: any) {
    sessionStorage.clear();
    const auth = { loggedIn: false, login: jasmine.createSpy('login').and.returnValue(loginResult) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();
    return { f, auth, router };
  }

  it('asks for both fields', () => {
    const { f, auth } = make(of({}));
    f.componentInstance.submit();
    expect(auth.login).not.toHaveBeenCalled();
    expect(f.componentInstance.error()).toBe('Enter username and password');
  });

  it('goes to the dashboard after signing in', () => {
    const { f, auth, router } = make(of({ token: 't' }));
    f.componentInstance.username = 'admin';
    f.componentInstance.password = 'pw';
    f.componentInstance.submit();
    expect(auth.login).toHaveBeenCalledWith('admin', 'pw');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('shows the server message on wrong password', () => {
    const { f } = make(throwError(() => new HttpErrorResponse({ status: 401, error: { message: 'Wrong username or password' } })));
    f.componentInstance.username = 'admin';
    f.componentInstance.password = 'x';
    f.componentInstance.submit();
    expect(f.componentInstance.error()).toBe('Wrong username or password');
    expect(f.componentInstance.busy()).toBeFalse();
  });
});

describe('Admin: dashboard', () => {
  it('shows the three quick actions and live counts', () => {
    setup();
    const f = TestBed.createComponent(DashboardComponent);
    f.detectChanges();
    const qa = [...f.nativeElement.querySelectorAll('.qa b')].map((b: any) => b.textContent);
    expect(qa).toEqual(['View & search queries', 'Download Excel', 'Send bulk message', 'Inbox', 'Voucher check-in']);
    expect(f.nativeElement.querySelector('a.qa[href="/admin/enquiries?panel=download"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('.tile.hi b').textContent).toBe('3');
  });
});

// =====================================================================
describe('AdminApi.exportEnquiries', () => {
  let api: AdminApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('names the file from the server header', () => {
    let name = '';
    api.exportEnquiries({ from: '2026-09-01', to: '2026-09-30', status: '' }).subscribe(r => (name = r.name));
    const req = http.expectOne(r => r.url === '/api/admin/enquiries/export');
    expect(req.request.params.get('from')).toBe('2026-09-01');
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.responseType).toBe('blob');
    req.event(new HttpResponse({ body: new Blob(['x']),
      headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="halappa-enquiries_2026-09-01_to_2026-09-30.xlsx"' }) }));
    expect(name).toBe('halappa-enquiries_2026-09-01_to_2026-09-30.xlsx');
  });

  it('all=true sends nothing else', () => {
    api.exportEnquiries({ status: 'new', from: '2026-01-01' }, [1, 2], true).subscribe();
    const req = http.expectOne(r => r.url === '/api/admin/enquiries/export');
    expect(req.request.params.keys()).toEqual(['all']);
    req.event(new HttpResponse({ body: new Blob(['x']) }));
  });

  it('selected ids are joined', () => {
    api.exportEnquiries({}, [4, 9]).subscribe();
    const req = http.expectOne(r => r.url === '/api/admin/enquiries/export');
    expect(req.request.params.get('ids')).toBe('4,9');
    req.event(new HttpResponse({ body: new Blob(['x']) }));
  });
});

describe('Routes', () => {
  it('every admin page is behind the sign-in guard, the login page is not', () => {
    const admin = routes.find(r => r.path === 'admin')!;
    expect(admin.canActivate).toContain(adminGuard);
    expect(admin.children!.map(c => c.path)).toEqual(['', 'enquiries', 'inbox', 'messages', 'messages/new', 'messages/:id', 'vouchers', 'whatsapp', 'posts', 'gallery', 'timeline', 'settings']);
    expect(routes.find(r => r.path === 'admin/login')!.canActivate).toBeUndefined();
  });

  it('has every public page from the footer', () => {
    const pub = routes.find(r => r.path === '')!.children!.map(c => c.path);
    for (const p of ['', 'about', 'stalwart-says', 'press/:category', 'my-views/:category', 'gallery', 'gallery/:category', 'timeline', 'contact', 'post/:id']) {
      expect(pub).withContext(p).toContain(p);
    }
  });
});
