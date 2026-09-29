import { of } from 'rxjs';
import { ApiService } from './core/api.service';
import { Settings } from './core/models';

/** Shared test fixtures (only imported by *.spec.ts files). */
export const SETTINGS: Settings = {
  phone: '9900123406',
  whatsapp: '919900123406',
  email: 'info@halappafoundation.in',
  facebook: 'https://facebook.com/halappafoundation',
  instagram: '',
  youtube: '',
  twitter: '',
  addressEn: 'Midigeshi, Madhugiri Taluk, Tumkur District, Karnataka',
  addressKn: 'ಮಿಡಿಗೇಶಿ, ಮಧುಗಿರಿ ತಾಲ್ಲೂಕು, ತುಮಕೂರು ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ',
  officeHours: 'Mon to Sat',
  mapQuery: 'Madhugiri',
};

export function apiStub(settings: Settings = SETTINGS) {
  return {
    settings: () => of(settings),
    refreshSettings: () => {},
    posts: jasmine.createSpy('posts').and.returnValue(of({ items: [], total: 0, page: 0, size: 12 })),
    post: jasmine.createSpy('post'),
    gallery: jasmine.createSpy('gallery').and.returnValue(of([])),
    timeline: jasmine.createSpy('timeline').and.returnValue(of([])),
    enquire: jasmine.createSpy('enquire'),
  };
}

export const provideApiStub = (stub = apiStub()) => ({ provide: ApiService, useValue: stub });

/** Makes the scroll-reveal observer a no-op so components render instantly in tests. */
export function stubIntersectionObserver() {
  (window as any).IntersectionObserver = class {
    observe() {} disconnect() {} unobserve() {} takeRecords() { return []; }
  };
}
