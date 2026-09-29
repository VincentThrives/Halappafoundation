import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, adminGuard, authInterceptor, errMsg } from './auth.service';

describe('AuthService, interceptor and guard', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
  });
  afterEach(() => { http.verify(); sessionStorage.clear(); });

  it('login stores token and user for this browser tab', () => {
    auth.login('admin', 'pw').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ username: 'admin', password: 'pw' });
    req.flush({ token: 'T1', username: 'admin' });
    expect(auth.loggedIn).toBeTrue();
    expect(auth.token).toBe('T1');
    expect(auth.user()).toBe('admin');
  });

  it('adds the token only to admin calls', () => {
    sessionStorage.setItem('hf-admin-token', 'T1');
    client.get('/api/admin/enquiries').subscribe();
    client.get('/api/public/settings').subscribe();
    client.get('/api/auth/me').subscribe();
    expect(http.expectOne('/api/admin/enquiries').request.headers.get('Authorization')).toBe('Bearer T1');
    expect(http.expectOne('/api/public/settings').request.headers.has('Authorization')).toBeFalse();
    expect(http.expectOne('/api/auth/me').request.headers.get('Authorization')).toBe('Bearer T1');
  });

  it('signs out and goes to login when an admin call returns 401', () => {
    sessionStorage.setItem('hf-admin-token', 'expired');
    client.get('/api/admin/dashboard').subscribe({ error: () => {} });
    http.expectOne('/api/admin/dashboard').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.loggedIn).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/login');
  });

  it('a 401 from a public call does not sign out', () => {
    sessionStorage.setItem('hf-admin-token', 'T1');
    client.get('/api/public/posts').subscribe({ error: () => {} });
    http.expectOne('/api/public/posts').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.loggedIn).toBeTrue();
  });

  it('guard sends signed-out visitors to the login page', () => {
    const result = TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any));
    expect(router.serializeUrl(result as any)).toBe('/admin/login');
  });

  it('guard lets signed-in admins through', () => {
    sessionStorage.setItem('hf-admin-token', 'T1');
    expect(TestBed.runInInjectionContext(() => adminGuard({} as any, {} as any))).toBeTrue();
  });

  it('logout clears everything', () => {
    sessionStorage.setItem('hf-admin-token', 'T1');
    auth.logout();
    expect(auth.token).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('errMsg reads the server message or falls back', () => {
    expect(errMsg(new HttpErrorResponse({ error: { message: 'Bad date' }, status: 400 }))).toBe('Bad date');
    expect(errMsg(new HttpErrorResponse({ error: 'oops', status: 500 }), 'Fallback')).toBe('Fallback');
    expect(errMsg(undefined)).toBe('Something went wrong');
  });
});
