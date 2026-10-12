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

  get token(): string | null { return sessionStorage.getItem(KEY); }
  get loggedIn(): boolean { return !!this.token; }

  login(username: string, password: string) {
    return this.http.post<{ token: string; username: string }>('/api/auth/login', { username, password }).pipe(
      tap(r => {
        sessionStorage.setItem(KEY, r.token);
        sessionStorage.setItem(KEY + '-user', r.username);
        this.user.set(r.username);
      }));
  }

  /** Ends the session. `signedOut` = the admin clicked Sign out (the login page then says so). */
  logout(signedOut = false) {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY + '-user');
    this.user.set(null);
    this.router.navigate(['/admin/login'], signedOut ? { queryParams: { signedOut: 1 } } : {});
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
  const isAdminCall = req.url.startsWith('/api/admin') || req.url.startsWith('/api/auth/me') || req.url.startsWith('/api/auth/change');
  const r = isAdminCall && auth.token ? req.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } }) : req;
  return next(r).pipe(catchError((e: HttpErrorResponse) => {
    if (e.status === 401 && isAdminCall) auth.logout();
    return throwError(() => e);
  }));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.loggedIn ? true : inject(Router).parseUrl('/admin/login');
};

/** Pulls the server's {"message": ...} out of an HTTP error. */
export function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const he = e as HttpErrorResponse;
  return (he?.error && typeof he.error === 'object' && he.error.message) || fallback;
}
