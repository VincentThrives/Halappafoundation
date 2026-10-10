import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MediaPipe, apiUrlInterceptor, backendUrl } from './backend';
import { authInterceptor } from './auth.service';
import { environment } from '../../environments/environment';

describe('backend URL handling', () => {
  const api = environment.apiUrl;

  it('development environment points at the local backend', () => {
    expect(environment.production).toBeFalse();
    expect(api).toBe('http://localhost:8090');
  });

  it('backendUrl prefixes /api and /uploads paths only', () => {
    expect(backendUrl('/api/public/settings')).toBe(api + '/api/public/settings');
    expect(backendUrl('/uploads/a.jpg')).toBe(api + '/uploads/a.jpg');
    expect(backendUrl('/img/logo.jpg')).toBe('/img/logo.jpg');          // site image, served by the frontend
    expect(backendUrl('https://x.test/a.jpg')).toBe('https://x.test/a.jpg');
    expect(backendUrl('/apiary')).toBe('/apiary');
    expect(backendUrl(null)).toBeNull();
    expect(backendUrl(undefined)).toBeUndefined();
    expect(backendUrl('')).toBe('');
  });

  it('media pipe gives uploaded photos the backend address', () => {
    const p = new MediaPipe();
    expect(p.transform('/uploads/p.png')).toBe(api + '/uploads/p.png');
    expect(p.transform('/img/office.jpg')).toBe('/img/office.jpg');
    expect(p.transform(null)).toBeNull();
  });

  describe('interceptors', () => {
    let http: HttpClient;
    let ctl: HttpTestingController;
    beforeEach(() => {
      sessionStorage.setItem('hf-admin-token', 'tok');
      TestBed.configureTestingModule({
        providers: [provideHttpClient(withInterceptors([authInterceptor, apiUrlInterceptor])), provideHttpClientTesting()],
      });
      http = TestBed.inject(HttpClient);
      ctl = TestBed.inject(HttpTestingController);
    });
    afterEach(() => { ctl.verify(); sessionStorage.clear(); });

    it('sends /api calls to the backend', () => {
      http.get('/api/public/settings').subscribe();
      ctl.expectOne(api + '/api/public/settings').flush({});
    });

    it('leaves other URLs alone', () => {
      http.get('/img/logo.jpg').subscribe();
      http.get('https://example.test/x').subscribe();
      ctl.expectOne('/img/logo.jpg').flush('');
      ctl.expectOne('https://example.test/x').flush('');
    });

    it('still adds the admin sign-in token after the URL is rewritten', () => {
      http.get('/api/admin/enquiries').subscribe();
      const req = ctl.expectOne(api + '/api/admin/enquiries');
      expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
      req.flush({});
    });
  });
});
