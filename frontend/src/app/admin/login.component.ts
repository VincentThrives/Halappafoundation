import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, errMsg } from '../core/auth.service';
import { EyeToggleComponent } from '../core/eye-toggle.component';

type Mode = 'signin' | 'forgot' | 'reset';

/** Admin sign in, plus "Forgot password?": a 6-digit code emailed to the foundation, then a new password. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, EyeToggleComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  username = '';
  password = '';
  code = '';
  newPassword = '';
  newPassword2 = '';
  readonly mode = signal<Mode>('signin');
  readonly busy = signal(false);
  readonly error = signal('');
  /** Green message: signed out, code sent, password changed. */
  readonly notice = signal('');

  constructor() {
    if (this.auth.loggedIn) { this.router.navigateByUrl('/admin'); return; }
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('signedOut')) this.notice.set("You've signed out.");
  }

  submit() {
    if (!this.username || !this.password) { this.error.set('Enter username and password'); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigateByUrl('/admin'),
      error: e => { this.busy.set(false); this.error.set(errMsg(e, 'Could not sign in')); },
    });
  }

  startForgot() { this.mode.set('forgot'); this.error.set(''); this.notice.set(''); this.password = ''; }

  backToSignIn() { this.mode.set('signin'); this.error.set(''); this.notice.set(''); }

  /** Emails the code (also used for "Send a new code"). */
  sendCode() {
    if (!this.username.trim()) { this.error.set('Enter your username'); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.forgot(this.username.trim()).subscribe({
      next: r => { this.busy.set(false); this.notice.set(r.message); this.mode.set('reset'); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e, "Couldn't send the code")); },
    });
  }

  resetPassword() {
    const code = this.code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) { this.error.set('Enter the 6-digit code from the email'); return; }
    if (this.newPassword.length < 8) { this.error.set('The new password needs at least 8 characters'); return; }
    if (this.newPassword !== this.newPassword2) { this.error.set("The two new passwords don't match"); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.resetPassword(this.username.trim(), code, this.newPassword).subscribe({
      next: r => {
        this.busy.set(false);
        this.code = this.newPassword = this.newPassword2 = this.password = '';
        this.mode.set('signin');
        this.notice.set(r.message);
      },
      error: e => { this.busy.set(false); this.error.set(errMsg(e, "Couldn't change the password")); },
    });
  }
}
