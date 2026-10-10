import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, errMsg } from '../core/auth.service';
import { EyeToggleComponent } from '../core/eye-toggle.component';

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
