import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ContactComponent } from './contact.component';
import { LangService } from '../core/lang.service';
import { apiStub, provideApiStub, stubIntersectionObserver } from '../testing';

describe('Contact Us page', () => {
  let f: ComponentFixture<ContactComponent>;
  let c: ContactComponent;
  let api: ReturnType<typeof apiStub>;

  beforeEach(() => {
    localStorage.removeItem('hf-lang');
    stubIntersectionObserver();
    api = apiStub();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideApiStub(api)] });
    TestBed.inject(LangService).set('en');
    f = TestBed.createComponent(ContactComponent);
    c = f.componentInstance;
    f.detectChanges();
    spyOn(window, 'scrollTo');
  });

  function fillValid() {
    c.form.patchValue({ name: 'Ramesh', phone: '9845012345', message: 'Need hostel details', district: 'Tumakuru' });
  }

  it('shows phone, WhatsApp, email and address cards', () => {
    const text = f.nativeElement.querySelector('.info').textContent;
    expect(text).toContain('+91 9900123406');
    expect(text).toContain('info@halappafoundation.in');
    expect(text).toContain('Madhugiri');
  });

  it('district list has all 31 districts plus "Outside Karnataka"', () => {
    const opts = f.nativeElement.querySelectorAll('#c-dist option');
    expect(opts.length).toBe(33); // placeholder + 31 + outside
  });

  it('does not send an empty form and shows the errors', () => {
    c.submit('email');
    f.detectChanges();
    expect(api.enquire).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelectorAll('.err').length).toBeGreaterThanOrEqual(3);
  });

  it('accepts common Indian mobile formats', () => {
    const phone = c.form.controls.phone;
    for (const ok of ['9845012345', '+919845012345', '+91 9845012345', '09845012345', '6123456789']) {
      phone.setValue(ok);
      expect(phone.valid).withContext(ok).toBeTrue();
    }
    for (const bad of ['12345', '5845012345', 'abcdefghij', '98450123456789']) {
      phone.setValue(bad);
      expect(phone.valid).withContext(bad).toBeFalse();
    }
  });

  it('rejects an invalid email but allows none', () => {
    fillValid();
    c.form.controls.email.setValue('not-email');
    c.submit('email');
    expect(api.enquire).not.toHaveBeenCalled();
    c.form.controls.email.setValue('');
    api.enquire.and.returnValue(of({ id: 1 }));
    c.submit('email');
    expect(api.enquire).toHaveBeenCalled();
  });

  it('Send via Email saves the query and shows the reference number', () => {
    api.enquire.and.returnValue(of({ id: 42 }));
    fillValid();
    c.submit('email');
    f.detectChanges();
    const body = api.enquire.calls.mostRecent().args[0];
    expect(body.channel).toBe('email');
    expect(body.lang).toBe('en');
    expect(body.website).toBe(''); // honeypot sent empty
    expect(f.nativeElement.querySelector('.ref').textContent).toContain('#42');
    expect(f.nativeElement.textContent).toContain('Our team will contact you soon');
  });

  it('Send via WhatsApp saves the query then opens the WhatsApp chat', () => {
    const tab = { location: { href: '' }, close: jasmine.createSpy('close') };
    spyOn(window, 'open').and.returnValue(tab as any);
    api.enquire.and.returnValue(of({ id: 43, whatsappUrl: 'https://wa.me/919900123406?text=x' }));
    fillValid();
    c.submit('whatsapp');
    f.detectChanges();
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.location.href).toBe('https://wa.me/919900123406?text=x');
    expect(api.enquire.calls.mostRecent().args[0].channel).toBe('whatsapp');
    expect(f.nativeElement.querySelector('.success a.btn-wa').getAttribute('href')).toBe('https://wa.me/919900123406?text=x');
  });

  it('sends the chosen language with the query', () => {
    TestBed.inject(LangService).set('kn');
    api.enquire.and.returnValue(of({ id: 1 }));
    fillValid();
    c.submit('email');
    expect(api.enquire.calls.mostRecent().args[0].lang).toBe('kn');
  });

  it('shows the server error and closes the blank WhatsApp tab on failure', () => {
    const tab = { location: { href: '' }, close: jasmine.createSpy('close') };
    spyOn(window, 'open').and.returnValue(tab as any);
    api.enquire.and.returnValue(throwError(() => new HttpErrorResponse({ status: 429, error: { message: 'Too many messages.' } })));
    fillValid();
    c.submit('whatsapp');
    f.detectChanges();
    expect(tab.close).toHaveBeenCalled();
    expect(f.nativeElement.querySelector('.err.big').textContent).toContain('Too many messages.');
    expect(c.busy()).toBe('');
  });

  it('"Send another message" resets the form', () => {
    api.enquire.and.returnValue(of({ id: 5 }));
    fillValid();
    c.submit('email');
    c.reset();
    f.detectChanges();
    expect(c.done()).toBeNull();
    expect(c.form.controls.name.value).toBe('');
    expect(c.form.controls.type.value).toBe('query');
  });
});
