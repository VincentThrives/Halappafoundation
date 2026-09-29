import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, retry, shareReplay } from 'rxjs';
import { GalleryItem, Page, Post, Settings, TimelineEntry } from './models';

const FALLBACK_SETTINGS: Settings = {
  phone: '9900123406', whatsapp: '919900123406', email: 'info@halappafoundation.in',
  youtube: 'https://www.youtube.com/@muralidharhalappa',
  facebook: 'https://www.facebook.com/share/19exAKzyMF/',
  instagram: 'https://www.instagram.com/muralidharhalappa',
  addressEn: 'Midigeshi, Madhugiri Taluk, Tumkur District, Karnataka',
  addressKn: 'ಮಿಡಿಗೇಶಿ, ಮಧುಗಿರಿ ತಾಲ್ಲೂಕು, ತುಮಕೂರು ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ',
};

/** Public, unauthenticated endpoints. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private settings$?: Observable<Settings>;

  settings(): Observable<Settings> {
    // Retry, then fall back to the known contact details so the header, footer and floating bar always render.
    return (this.settings$ ??= this.http.get<Settings>('/api/public/settings').pipe(
      retry({ count: 3, delay: 1500 }),
      catchError(() => of(FALLBACK_SETTINGS)),
      shareReplay(1)));
  }
  refreshSettings() { this.settings$ = undefined; }

  posts(section?: string, category?: string, page = 0, size = 12) {
    let p = new HttpParams().set('page', page).set('size', size);
    if (section) p = p.set('section', section);
    if (category) p = p.set('category', category);
    return this.http.get<Page<Post>>('/api/public/posts', { params: p });
  }

  post(id: number) { return this.http.get<Post>(`/api/public/posts/${id}`); }

  gallery(category?: string) {
    return this.http.get<GalleryItem[]>('/api/public/gallery', { params: category ? { category } : {} });
  }

  timeline() { return this.http.get<TimelineEntry[]>('/api/public/timeline'); }

  enquire(body: Record<string, unknown>) {
    return this.http.post<{ id: number; whatsappUrl?: string }>('/api/public/enquiries', body);
  }
}

/** Removes empty values and builds HttpParams. */
export function toParams(o: Record<string, unknown>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p;
}
