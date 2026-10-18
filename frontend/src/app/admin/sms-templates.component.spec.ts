import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { ConfirmService } from '../core/confirm.service';
import { SmsTemplatesComponent } from './sms-templates.component';

const SAVED = { id: 1, name: 'General invitation', templateId: '6ad492ac244b', text: 'Dear ##name##, ##event## on ##date##' };

describe('Settings: SMS templates', () => {
  function make(confirm = true) {
    const api = {
      smsTemplates: jasmine.createSpy('smsTemplates').and.returnValue(of([SAVED])),
      saveSmsTemplate: jasmine.createSpy('saveSmsTemplate').and.callFake((_id: any, b: any) => of({ id: 2, ...b })),
      deleteSmsTemplate: jasmine.createSpy('deleteSmsTemplate').and.returnValue(of({})),
    };
    TestBed.configureTestingModule({ providers: [{ provide: AdminApi, useValue: api }] });
    const ask = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(confirm);
    const f = TestBed.createComponent(SmsTemplatesComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, api, ask, el: f.nativeElement as HTMLElement };
  }

  it('lists saved templates with their MSG91 ID and text', () => {
    const { el } = make();
    expect(el.querySelector('.sms-item b')!.textContent).toBe('General invitation');
    expect(el.querySelector('.sms-item code')!.textContent).toBe('6ad492ac244b');
    expect(el.querySelector('.sms-text')!.textContent).toContain('##event##');
  });

  it('add: checks the fields, warns about DLT {#var#} text, saves and reloads', () => {
    const { f, c, api, el } = make();
    c.add();
    c.save();
    expect(c.msg()).toContain('Give the template a name');
    c.name = 'Students';
    c.templateId = '6ad49208a940';
    c.text = 'Dear {#var#}, see you';
    f.detectChanges();
    expect(el.querySelector('.sms-form .warn')!.textContent).toContain('{#var#}');
    c.save();
    expect(c.msg()).toContain("MSG91's ##variable## form");
    expect(api.saveSmsTemplate).not.toHaveBeenCalled();

    c.text = 'Students ##event## on ##date##';
    f.detectChanges();
    expect([...el.querySelectorAll('.sms-form .tok')].map(t => t.textContent)).toEqual(['##event##', '##date##']);
    c.save();
    expect(api.saveSmsTemplate).toHaveBeenCalledWith(null, { name: 'Students', templateId: '6ad49208a940', text: 'Students ##event## on ##date##' });
    expect(c.editing()).toBeNull();
    expect(api.smsTemplates).toHaveBeenCalledTimes(2);
    expect(c.msgOk()).toBeTrue();
  });

  it('edit saves to the same template; server refusals are shown', () => {
    const { c, api } = make();
    c.edit(SAVED);
    expect(c.name).toBe('General invitation');
    api.saveSmsTemplate.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Enter the MSG91 template ID' } })));
    c.save();
    expect(api.saveSmsTemplate.calls.mostRecent().args[0]).toBe(1);
    expect(c.msg()).toBe('Enter the MSG91 template ID');
    expect(c.msgOk()).toBeFalse();
  });

  it('delete asks first; cancelling keeps it', async () => {
    const { c, api, ask } = make(false);
    await c.remove(SAVED);
    expect(ask).toHaveBeenCalled();
    expect(api.deleteSmsTemplate).not.toHaveBeenCalled();
  });
});
