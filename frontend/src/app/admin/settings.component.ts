import { Component, QueryList, ViewChildren, inject, signal } from '@angular/core';
import { IconComponent } from '../core/icon.component';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { ApiService } from '../core/api.service';
import { errMsg } from '../core/auth.service';
import { Settings } from '../core/models';
import { EyeToggleComponent } from '../core/eye-toggle.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, EyeToggleComponent, IconComponent],
  styleUrl: './admin.scss',
  templateUrl: './settings.component.html',
})
export class SettingsComponent {
  private api = inject(AdminApi);
  private pub = inject(ApiService);
  readonly s = signal<Settings | null>(null);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  readonly pwMsg = signal('');
  readonly pwOk = signal(false);
  readonly pwBusy = signal(false);
  @ViewChildren(EyeToggleComponent) private eyes!: QueryList<EyeToggleComponent>;
  cur = '';
  nw = '';
  nw2 = '';

  constructor() { this.api.settings().subscribe(s => this.s.set(s)); }

  private note(text: string, ok: boolean) { this.msg.set(text); this.msgOk.set(ok); }
  private pwNote(text: string, ok: boolean) { this.pwMsg.set(text); this.pwOk.set(ok); }

  save(s: Settings) {
    for (const k of ['facebook', 'instagram', 'youtube', 'twitter']) {
      if (s[k] && !/^https?:\/\//.test(s[k])) { this.note(`${k} must start with https://`, false); return; }
    }
    this.api.saveSettings(s).subscribe({
      next: r => { this.s.set(r); this.pub.refreshSettings(); this.note('Saved. The public site shows the new details on next page load.', true); },
      error: e => this.note(errMsg(e), false),
    });
  }

  changePw() {
    if (!this.cur) { this.pwNote('Enter your current password', false); return; }
    if (this.nw.length < 8) { this.pwNote('New password must be at least 8 characters', false); return; }
    if (this.nw !== this.nw2) { this.pwNote('Passwords do not match', false); return; }
    if (this.nw === this.cur) { this.pwNote('New password must be different from the current one', false); return; }
    this.pwBusy.set(true);
    this.api.changePassword(this.cur, this.nw).subscribe({
      next: () => {
        this.pwBusy.set(false);
        this.pwNote('Password changed successfully', true);
        this.cur = this.nw = this.nw2 = '';
        this.eyes?.forEach(e => e.hide()); // back to dots
      },
      error: e => { this.pwBusy.set(false); this.pwNote(errMsg(e), false); },
    });
  }
}
