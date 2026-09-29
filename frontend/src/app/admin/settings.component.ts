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
  template: `
    <div class="head"><div><h1>Settings</h1><p>Contact details and social links used across the website and the floating side bar.</p></div></div>

    @if (s(); as s) {
      <div class="card stack">
        <h2>Contact</h2>
        <div class="grid3">
          <div class="field"><label>Phone (10 digits)</label><input class="input" [(ngModel)]="s['phone']"></div>
          <div class="field"><label>WhatsApp (with country code, e.g. 919900123406)</label><input class="input" [(ngModel)]="s['whatsapp']"></div>
          <div class="field"><label>Email</label><input class="input" [(ngModel)]="s['email']"></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Address <span class="lang-tag">EN</span></label><textarea class="input" rows="2" [(ngModel)]="s['addressEn']"></textarea></div>
          <div class="field"><label>Address <span class="lang-tag">ಕನ್ನಡ</span></label><textarea class="input" rows="2" [(ngModel)]="s['addressKn']"></textarea></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Office hours</label><input class="input" [(ngModel)]="s['officeHours']"></div>
          <div class="field"><label>Map location (place name or address for Google Maps)</label><input class="input" [(ngModel)]="s['mapQuery']"></div>
        </div>
        <h2>Social links</h2>
        <div class="grid2">
          <div class="field"><label>Facebook page URL</label><input class="input" [(ngModel)]="s['facebook']" placeholder="https://facebook.com/…"></div>
          <div class="field"><label>Instagram URL</label><input class="input" [(ngModel)]="s['instagram']" placeholder="https://instagram.com/…"></div>
          <div class="field"><label>YouTube URL</label><input class="input" [(ngModel)]="s['youtube']" placeholder="https://youtube.com/@…"></div>
          <div class="field"><label>X / Twitter URL</label><input class="input" [(ngModel)]="s['twitter']" placeholder="https://x.com/…"></div>
        </div>
        @if (msg()) {
          <div class="alert" [class.ok]="msgOk()" [class.bad]="!msgOk()" role="status" aria-live="polite">
            <app-icon [name]="msgOk() ? 'check' : 'close'" /><span>{{ msg() }}</span>
          </div>
        }
        <div><button class="btn btn-maroon" (click)="save(s)">Save settings</button></div>
      </div>
    }

    <div class="card stack">
      <h2>Change password</h2>
      <div class="grid3">
        <div class="field"><label for="pw-cur">Current password</label>
          <div class="pw"><input #pc id="pw-cur" class="input" type="password" [(ngModel)]="cur" autocomplete="current-password"><app-eye [for]="pc" /></div></div>
        <div class="field"><label for="pw-new">New password (min 8)</label>
          <div class="pw"><input #pn id="pw-new" class="input" type="password" [(ngModel)]="nw" autocomplete="new-password"><app-eye [for]="pn" /></div></div>
        <div class="field"><label for="pw-rep">Repeat new password</label>
          <div class="pw"><input #pr id="pw-rep" class="input" type="password" [(ngModel)]="nw2" autocomplete="new-password"><app-eye [for]="pr" /></div></div>
      </div>
      @if (pwMsg()) {
        <div class="alert" [class.ok]="pwOk()" [class.bad]="!pwOk()" role="status" aria-live="polite">
          <app-icon [name]="pwOk() ? 'check' : 'close'" />
          <span>{{ pwMsg() }}@if (pwOk()) {<small>Use the new password the next time you sign in.</small>}</span>
        </div>
      }
      <div><button class="btn btn-maroon" (click)="changePw()" [disabled]="pwBusy()">{{ pwBusy() ? 'Changing…' : 'Change password' }}</button></div>
    </div>
  `,
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
