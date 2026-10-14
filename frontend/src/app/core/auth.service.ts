import { HttpClient, HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';

const KEY = 'hf-admin-token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly user = signal<string | null>(sessionStorage.getItem(KEY + '-user'));
  /** "ADMIN" or "SUPER_ADMIN". */
  readonly role = signal<string | null>(sessionStorage.getItem(KEY + '-role'));

  get isSuper(): boolean { return this.role() === 'SUPER_ADMIN'; }

  get token(): string | null { return sessionStorage.getItem(KEY); }
  get loggedIn(): boolean { return !!this.token; }

  /** superAdmin = the hidden /superadmin page; each page only accepts its own kind of account. */
  login(username: string, password: string, superAdmin = false) {
    return this.http.post<{ token: string; username: string; role?: string }>('/api/auth/login', { username, password, superAdmin }).pipe(
      tap(r => {
        sessionStorage.setItem(KEY, r.token);
        sessionStorage.setItem(KEY + '-user', r.username);
        sessionStorage.setItem(KEY + '-role', r.role ?? 'ADMIN');
        this.user.set(r.username);
        this.role.set(r.role ?? 'ADMIN');
      }));
  }

  /** Ends the session. `signedOut` = the admin clicked Sign out (the login page then says so). */
  logout(signedOut = false) {
    // The super admin goes back to its own hidden page, never to the admin login.
    const page = this.isSuper ? '/superadmin' : '/admin/login';
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY + '-user');
    sessionStorage.removeItem(KEY + '-role');
    this.user.set(null);
    this.role.set(null);
    this.router.navigate([page], signedOut ? { queryParams: { signedOut: 1 } } : {});
  }

  /** "Forgot password?" step 1: emails a 6-digit code to the foundation's admin email. */
  forgot(username: string) {
    return this.http.post<{ message: string }>('/api/auth/forgot', { username });
  }

  /** Step 2: the emailed code and a new password. */
  resetPassword(username: string, code: string, password: string) {
    return this.http.post<{ message: string }>('/api/auth/reset', { username, code, password });
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const isAdminCall = req.url.startsWith('/api/admin') || req.url.startsWith('/api/super')
    || req.url.startsWith('/api/auth/me') || req.url.startsWith('/api/auth/change');
  const sentToken = isAdminCall && !!auth.token;
  const r = sentToken ? req.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } }) : req;
  return next(r).pipe(catchError((e: HttpErrorResponse) => {
    // Only an expired/invalid sign-in ends the session; a call made after signing out must not sign out again.
    if (e.status === 401 && sentToken) auth.logout();
    return throwError(() => e);
  }));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.loggedIn ? true : inject(Router).parseUrl('/admin/login');
};

/** Super admin screens: other admins are sent to the dashboard. */
export const superGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.loggedIn) return inject(Router).parseUrl('/superadmin');
  return auth.isSuper ? true : inject(Router).parseUrl('/admin');
};

/** Pulls the server's {"message": ...} out of an HTTP error. */
export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const he = e as HttpErrorResponse;
  const msg = he?.error && typeof he.error === 'object' && he.error.message;
  if (msg) return msg;
  // No answer at all: server stopped, offline, or this address isn't in the server's CORS_ORIGINS.
  if (he?.status === 0) return `${fallback}: the server could not be reached. Check your internet and try again.`;
  // Render's free plan sleeps; the first request after a quiet spell gets 502/503/504 while it wakes up.
  if ([502, 503, 504].includes(he?.status)) return `${fallback}: the server is starting up. Please try again in a minute.`;
  return fallback;
}
