import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.service';
import { apiUrlInterceptor } from './core/backend';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      // Page-to-page animation; styled via ::view-transition-* in app.component.
      withViewTransitions({ skipInitialTransition: true })),
    // authInterceptor sees the short '/api/...' path first; apiUrlInterceptor then points it at the backend.
    provideHttpClient(withInterceptors([authInterceptor, apiUrlInterceptor])),
  ],
};
