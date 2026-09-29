import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EyeToggleComponent } from './eye-toggle.component';
import { SettingsComponent } from '../admin/settings.component';
import { LoginComponent } from '../admin/login.component';
import { AdminApi } from '../admin/admin-api.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  imports: [EyeToggleComponent],
  template: `<div class="pw"><input #p type="password" value="Secret@123"><app-eye [for]="p" /></div>`,
})
class Host {}

describe('Password eye button', () => {
  it('shows and hides the password, keeping the typing cursor in the box', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const input = f.nativeElement.querySelector('input') as HTMLInputElement;
    const btn = f.nativeElement.querySelector('app-eye button') as HTMLButtonElement;
    expect(input.type).toBe('password');
    expect(btn.getAttribute('aria-label')).toBe('Show password');

    btn.click(); f.detectChanges();
    expect(input.type).toBe('text');
    expect(input.value).toBe('Secret@123');
    expect(btn.getAttribute('aria-label')).toBe('Hide password');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(input);

    btn.click(); f.detectChanges();
    expect(input.type).toBe('password');
  });

  it('is a plain button, so clicking it never submits a form', () => {
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    expect((f.nativeElement.querySelector('app-eye button') as HTMLButtonElement).type).toBe('button');
  });

  it('all three Change-password boxes have their own eye', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminApi, useValue: { settings: () => of({}), saveSettings: () => of({}), changePassword: () => of({}) } },
        { provide: ApiService, useValue: { refreshSettings() {} } },
      ],
    });
    const f = TestBed.createComponent(SettingsComponent);
    f.detectChanges();
    const eyes = f.nativeElement.querySelectorAll('.pw app-eye button') as NodeListOf<HTMLButtonElement>;
    expect(eyes.length).toBe(3);
    eyes[1].click(); f.detectChanges();
    expect((f.nativeElement.querySelector('#pw-new') as HTMLInputElement).type).toBe('text');
    expect((f.nativeElement.querySelector('#pw-cur') as HTMLInputElement).type).toBe('password'); // independent
  });

  it('the sign-in password box has an eye too', () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { loggedIn: false, login: () => of({}) } }],
    });
    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();
    f.nativeElement.querySelector('app-eye button').click();
    f.detectChanges();
    expect((f.nativeElement.querySelector('#p') as HTMLInputElement).type).toBe('text');
  });
});
