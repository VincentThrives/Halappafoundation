import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, errMsg } from '../core/auth.service';
import { EyeToggleComponent } from '../core/eye-toggle.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, EyeToggleComponent],
  template: `
    <div class="wrap">
      <form class="box" (ngSubmit)="submit()">
        <img src="img/logo.jpg" alt="">
        <h1>Admin sign in</h1>
        <p>Halappa Foundation</p>
        <div class="field">
          <label for="u">Username</label>
          <input id="u" class="input" name="u" [(ngModel)]="username" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="p">Password</label>
          <div class="pw">
            <input #pw id="p" class="input" name="p" type="password" [(ngModel)]="password" autocomplete="current-password" required>
            <app-eye [for]="pw" />
          </div>
        </div>
        @if (error()) { <p class="err">{{ error() }}</p> }
        <button class="btn" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
        <a routerLink="/" class="back">← Back to website</a>
      </form>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 20px; background: radial-gradient(ellipse at 70% 30%, #9a1220, #3a0308 60%, #240205); }
    .box { width: min(400px, 100%); background: #fff; border-radius: 22px; padding: 36px 32px; display: grid; gap: 16px; text-align: center; box-shadow: 0 40px 80px -30px rgba(0,0,0,.7); border-top: 5px solid var(--g-500); animation: rise .6s var(--ease) both; }
    img { width: 90px; height: 90px; border-radius: 50%; margin: -80px auto 0; border: 5px solid #fff; box-shadow: var(--shadow); }
    h1 { margin: 0; font-size: 1.6rem; }
    p { margin: -10px 0 6px; color: var(--muted); }
    .field { text-align: left; }
    .back { color: var(--muted); font-size: .9rem; text-decoration: none; }
    .err { margin: 0; color: var(--m-500); }
  `],
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() { if (this.auth.loggedIn) this.router.navigateByUrl('/admin'); }

  submit() {
    if (!this.username || !this.password) { this.error.set('Enter username and password'); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/admin'),
      error: e => { this.busy.set(false); this.error.set(errMsg(e, 'Could not sign in')); },
    });
  }
}
