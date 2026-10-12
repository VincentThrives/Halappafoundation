import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse, HttpHeaders, HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { EnquiriesComponent } from './enquiries.component';
import { LoginComponent } from './login.component';
import { DashboardComponent } from './dashboard.component';
import { AuthService, adminGuard, superGuard } from '../core/auth.service';
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
    expect(auth.login).toHaveBeenCalledWith('admin', 'pw', false);
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

describe('Hidden /superadmin sign-in', () => {
  function make(opts: { loggedIn?: boolean; isSuper?: boolean; superPage?: boolean } = {}) {
    sessionStorage.clear();
    const auth = { loggedIn: !!opts.loggedIn, isSuper: !!opts.isSuper,
      login: jasmine.createSpy('login').and.returnValue(of({ role: 'SUPER_ADMIN' })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { data: { superAdmin: opts.superPage ?? true }, queryParamMap: convertToParamMap({}) } } }] });
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, auth, nav, el: f.nativeElement as HTMLElement };
  }

  it('says super admin, signs in in super admin mode and opens the super admin screen', () => {
    const { c, auth, nav, el } = make();
    expect(el.querySelector('h1')!.textContent).toBe('Super admin sign in');
    c.username = 'superadmin';
    c.password = 'pw';
    c.submit();
    expect(auth.login).toHaveBeenCalledWith('superadmin', 'pw', true);
    expect(nav).toHaveBeenCalledWith('/admin/super');
  });

  it('a signed-in super admin goes straight in; a signed-in admin still sees the form', () => {
    expect(make({ loggedIn: true, isSuper: true }).nav).toHaveBeenCalledWith('/admin/super');
  });

  it('a signed-in admin opening /superadmin is not let in', () => {
    const { nav, el } = make({ loggedIn: true, isSuper: false });
    expect(nav).not.toHaveBeenCalled();
    expect(el.querySelector('form')).toBeTruthy();
  });

  it('the normal admin login never mentions the super admin', () => {
    const { el } = make({ superPage: false });
    expect(el.querySelector('h1')!.textContent).toBe('Admin sign in');
    expect(el.textContent!.toLowerCase()).not.toContain('super');
  });
});

describe('Admin: forgot password and sign-out note', () => {
  function make(opts: { query?: Record<string, string>; forgot?: any; reset?: any } = {}) {
    sessionStorage.clear();
    const auth = {
      loggedIn: false,
      login: jasmine.createSpy('login').and.returnValue(of({})),
      forgot: jasmine.createSpy('forgot').and.returnValue(opts.forgot ?? of({ message: 'If that username exists, a 6-digit code has been emailed to in**@halappafoundation.in. It works for 10 minutes.' })),
      resetPassword: jasmine.createSpy('resetPassword').and.returnValue(opts.reset ?? of({ message: 'Password changed. Sign in with your new password.' })),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(opts.query ?? {}) } } }] });
    spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, auth, el: f.nativeElement as HTMLElement };
  }
  const click = (el: HTMLElement, text: string) =>
    ([...el.querySelectorAll('button')].find(b => b.textContent!.includes(text)) as HTMLButtonElement).click();

  it('after Sign out the login page says so in green', () => {
    const { el } = make({ query: { signedOut: '1' } });
    expect(el.querySelector('.ok')!.textContent).toContain("You've signed out.");
  });

  it('no note on a normal visit', () => {
    const { el } = make();
    expect(el.querySelector('.ok')).toBeNull();
  });

  it('full flow: Forgot password? → email a code → code + new password → back to sign in', () => {
    const { f, c, auth, el } = make();
    click(el, 'Forgot password?');
    f.detectChanges();
    expect(el.querySelector('h1')!.textContent).toBe('Reset password');

    c.sendCode(); // no username yet
    expect(c.error()).toBe('Enter your username');
    expect(auth.forgot).not.toHaveBeenCalled();

    c.username = ' admin ';
    click(el, 'Email me a code');
    f.detectChanges();
    expect(auth.forgot).toHaveBeenCalledWith('admin');
    expect(el.querySelector('h1')!.textContent).toBe('Set a new password');
    expect(el.querySelector('.ok')!.textContent).toContain('in**@halappafoundation.in');
    expect(el.querySelectorAll('app-eye').length).toBe(2);

    // checks before anything is sent
    c.code = '12a'; c.resetPassword();
    expect(c.error()).toBe('Enter the 6-digit code from the email');
    c.code = '123 456'; c.newPassword = 'short'; c.resetPassword();
    expect(c.error()).toBe('The new password needs at least 8 characters');
    c.newPassword = 'Brand@New456'; c.newPassword2 = 'Different@1'; c.resetPassword();
    expect(c.error()).toBe("The two new passwords don't match");
    expect(auth.resetPassword).not.toHaveBeenCalled();

    c.newPassword2 = 'Brand@New456';
    c.resetPassword();
    expect(auth.resetPassword).toHaveBeenCalledWith('admin', '123456', 'Brand@New456');
    f.detectChanges();
    expect(el.querySelector('h1')!.textContent).toBe('Admin sign in');
    expect(el.querySelector('.ok')!.textContent).toContain('Password changed');
    expect(c.newPassword).toBe('');
    expect(c.username).toBe(' admin '); // kept, ready to sign in
  });

  it('shows the server reason (wrong code, email not set up) and allows a new code', () => {
    const bad = throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'The code is wrong or has expired. Ask for a new code.' } }));
    const { f, c, auth, el } = make({ reset: bad });
    c.username = 'admin';
    c.startForgot();
    c.sendCode();
    f.detectChanges();
    c.code = '000000'; c.newPassword = c.newPassword2 = 'Brand@New456';
    c.resetPassword();
    f.detectChanges();
    expect(el.querySelector('.err')!.textContent).toContain('wrong or has expired');
    expect(c.busy()).toBeFalse();
    click(el, 'Send a new code');
    expect(auth.forgot).toHaveBeenCalledTimes(2);
  });

  it('when email is not set up on the server, Forgot explains it and stays on the form', () => {
    const notSetUp = throwError(() => new HttpErrorResponse({ status: 400, error: { message: "Password reset by email isn't set up on the server yet" } }));
    const { f, c, el } = make({ forgot: notSetUp });
    c.startForgot();
    c.username = 'admin';
    c.sendCode();
    f.detectChanges();
    expect(c.mode()).toBe('forgot');
    expect(el.querySelector('.err')!.textContent).toContain("isn't set up on the server");
    click(el, 'Back to sign in');
    f.detectChanges();
    expect(c.mode()).toBe('signin');
    expect(c.error()).toBe('');
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
    expect(admin.children!.map(c => c.path)).toEqual(['', 'enquiries', 'inbox', 'messages', 'messages/new', 'messages/:id', 'vouchers', 'whatsapp', 'posts', 'gallery', 'timeline', 'settings', 'wallet', 'super']);
    expect(routes.find(r => r.path === 'admin/login')!.canActivate).toBeUndefined();
    // the Super admin page has its own guard on top of the sign-in one
    expect(admin.children!.find(c => c.path === 'super')!.canActivate).toEqual([superGuard]);
  });

  it('/superadmin is a separate, unguarded sign-in page in super admin mode', () => {
    const r = routes.find(x => x.path === 'superadmin')!;
    expect(r.data).toEqual({ superAdmin: true });
    expect(r.canActivate).toBeUndefined();
  });

  it('super admin guard: only the super admin gets in; admins go to the dashboard', () => {
    const run = (loggedIn: boolean, isSuper: boolean) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: { loggedIn, isSuper } }] });
      const r = TestBed.runInInjectionContext(() => superGuard({} as any, {} as any));
      return r === true ? true : TestBed.inject(Router).serializeUrl(r as any);
    };
    expect(run(true, true)).toBeTrue();
    expect(run(true, false)).toBe('/admin');
    expect(run(false, false)).toBe('/superadmin'); // never reveals the admin login
  });

  it('has every public page from the footer', () => {
    const pub = routes.find(r => r.path === '')!.children!.map(c => c.path);
    for (const p of ['', 'about', 'stalwart-says', 'press/:category', 'my-views/:category', 'gallery', 'gallery/:category', 'timeline', 'contact', 'post/:id']) {
      expect(pub).withContext(p).toContain(p);
    }
  });
});
