import { ConfirmService } from '../core/confirm.service';
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { DEFAULT_INVITE, NewCampaignComponent, fillTemplate, personalise, templateVariables } from './new-campaign.component';
import { CampaignsComponent } from './campaigns.component';
import { CampaignDetailComponent } from './campaign-detail.component';
import { InboxComponent } from './inbox.component';
import { VouchersComponent } from './vouchers.component';
import { CampaignView, Channels, ImportResult, Message } from '../core/models';

const NONE: Channels = { whatsappApi: false, whatsappInbound: false, email: false, emailInbound: false, sms: false, smsInbound: false, maxRecipients: 5000 };
const ALL: Channels = { whatsappApi: true, whatsappInbound: true, email: true, emailInbound: true, sms: true, smsInbound: true, maxRecipients: 5000 };

const IMPORT: ImportResult = {
  rows: [
    { row: 2, name: 'Ramesh', phone: '919845012345', voucher: 'HV-1' },
    { row: 3, name: 'Suma', phone: '919123456789', voucher: 'HV-2' },
  ],
  problems: [{ row: 4, reason: 'Invalid phone: 123' }],
  totalRows: 3, hasVoucherColumn: true, hasPhoneColumn: true, hasEmailColumn: false,
};

function view(over: Partial<CampaignView['campaign']> = {}, stats: Partial<CampaignView['stats']> = {}): CampaignView {
  return {
    campaign: { id: 7, name: 'Kit distribution', channel: 'whatsapp', mode: 'api', voucherMode: 'auto', voucherInfo: 'KIT-0001 – KIT-0002',
      total: 2, status: 'running', createdAt: '2026-09-29T10:00:00', ...over },
    stats: { total: 2, queued: 2, sent: 0, delivered: 0, read: 0, failed: 0, manual: 0, cancelled: 0, attended: 0, ...stats },
  };
}

function msg(over: Partial<Message> = {}): Message {
  return { id: 1, channel: 'whatsapp', direction: 'out', contact: '919845012345', name: 'Ramesh', status: 'manual',
    body: 'Namaskara Ramesh, voucher KIT-0001', voucher: 'KIT-0001', createdAt: '2026-09-29T10:00:00', ...over };
}

function stub(channels: Channels = NONE) {
  return {
    channels: jasmine.createSpy('channels').and.returnValue(of(channels)),
    importRecipients: jasmine.createSpy('importRecipients').and.returnValue(of(IMPORT)),
    recipientsTemplate: jasmine.createSpy('recipientsTemplate').and.returnValue(of({ blob: new Blob(['x']), name: 't.xlsx' })),
    enquiries: jasmine.createSpy('enquiries').and.returnValue(of({ items: [], total: 12, page: 0, size: 1 })),
    campaigns: jasmine.createSpy('campaigns').and.returnValue(of([view()])),
    campaign: jasmine.createSpy('campaign').and.returnValue(of(view())),
    createCampaign: jasmine.createSpy('createCampaign').and.returnValue(of(view())),
    campaignRecipients: jasmine.createSpy('campaignRecipients').and.returnValue(of({ items: [msg()], total: 1, page: 0, size: 50 })),
    campaignAction: jasmine.createSpy('campaignAction').and.returnValue(of(view({ status: 'paused' }))),
    exportCampaign: jasmine.createSpy('exportCampaign').and.returnValue(of({ blob: new Blob(['x']), name: 'send-7.xlsx' })),
    manualSent: jasmine.createSpy('manualSent').and.callFake((_c: number, id: number) => of(msg({ id, status: 'sent' }))),
    threads: jasmine.createSpy('threads').and.returnValue(of({ items: [
      { channel: 'whatsapp', contact: '919845012345', name: 'Suresh', lastBody: 'I will come', lastDirection: 'in', lastAt: '2026-09-29T10:00:00', unread: 2, received: 2 },
    ], total: 1, page: 0, size: 30 })),
    thread: jasmine.createSpy('thread').and.returnValue(of([
      msg({ id: 10, direction: 'in', status: 'received', body: 'Where is the venue?', voucher: undefined }),
      msg({ id: 11, direction: 'out', status: 'read', body: 'Community hall' }),
    ])),
    unread: jasmine.createSpy('unread').and.returnValue(of({ unread: 2 })),
    messageLog: jasmine.createSpy('messageLog').and.returnValue(of({ items: [msg()], total: 1, page: 0, size: 50 })),
    reply: jasmine.createSpy('reply').and.returnValue(of({ message: msg({ id: 12, status: 'sent', body: 'Thanks' }) })),
    findVoucher: jasmine.createSpy('findVoucher').and.returnValue(of([msg({ status: 'sent' })])),
    attend: jasmine.createSpy('attend').and.returnValue(of(msg({ status: 'sent', attendedAt: '2026-10-12T10:05:00' }))),
    whatsappTemplates: jasmine.createSpy('whatsappTemplates').and.returnValue(of({ available: false, templates: [], message: 'Template list isn\'t available' })),
  };
}

const KIT_TEMPLATE = {
  name: 'kit_invite', language: 'kn', status: 'APPROVED', variables: 3,
  body: 'Namaskara {{1}}, you are invited to the kit distribution on {{3}}. Your entrance voucher: {{2}}',
};

function configure(api: ReturnType<typeof stub>, params: Record<string, string> = {}) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), queryParamMap: convertToParamMap({}) } } }],
  });
}

// =====================================================================
describe('personalise()', () => {
  it('fills name and voucher like the server does', () => {
    expect(personalise('Namaskara {name}, voucher {voucher}', 'Ramesh', 'KIT-1')).toBe('Namaskara Ramesh, voucher KIT-1');
    expect(personalise('Namaskara {name}, hi', '', '')).toBe('Namaskara, hi');
  });
  it('default invitation is bilingual and uses both placeholders', () => {
    expect(DEFAULT_INVITE).toContain('{name}');
    expect(DEFAULT_INVITE).toContain('{voucher}');
    expect(DEFAULT_INVITE).toContain('ಪ್ರವೇಶ ಚೀಟಿ');
  });
});

// =====================================================================
describe('WhatsApp template helpers', () => {
  it('counts {{n}} and fills them like the server', () => {
    expect(templateVariables('Hi {{1}}, voucher {{2}}, on {{ 3 }}')).toBe(3);
    expect(templateVariables('No blanks')).toBe(0);
    expect(fillTemplate('Hi {{1}}, voucher {{2}}', ['Asha', 'KIT-1'])).toBe('Hi Asha, voucher KIT-1');
    expect(fillTemplate('Hi {{1}} and {{1}}', ['A'])).toBe('Hi A and A');
  });
});

describe('New bulk message', () => {
  let api: ReturnType<typeof stub>;
  let f: ComponentFixture<NewCampaignComponent>;
  let c: NewCampaignComponent;

  function create(channels = NONE, state: any = {}) {
    history.replaceState(state, '');
    api = stub(channels);
    configure(api);
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    f = TestBed.createComponent(NewCampaignComponent);
    c = f.componentInstance;
    f.detectChanges();
  }
  afterEach(() => history.replaceState({}, ''));

  it('defaults: WhatsApp, Excel import, auto vouchers KIT-<year>-0001, bilingual invite', async () => {
    create();
    expect(c.channel).toBe('whatsapp');
    expect(c.source).toBe('excel');
    expect(c.voucherOn).toBeTrue();
    expect(c.sampleVoucher()).toBe(`KIT-${new Date().getFullYear()}-0001`);
    expect(c.message).toBe(DEFAULT_INVITE);
  });

  it('warns that WhatsApp will be manual without the API', async () => {
    create(NONE);
    expect(f.nativeElement.querySelector('.note').textContent).toContain('manual');
    expect(c.status('email')).toBe('Not connected');
  });

  it('importing Excel shows ready / skipped counts and switches to the file\'s vouchers', async () => {
    create();
    c.upload(new File(['x'], 'list.xlsx'));
    f.detectChanges();
    expect(api.importRecipients).toHaveBeenCalled();
    expect(f.nativeElement.querySelector('.summary').textContent).toContain('2 ready');
    expect(f.nativeElement.querySelector('.summary').textContent).toContain('1 skipped');
    expect(c.voucherMode).toBe('excel');
    expect(c.sampleVoucher()).toBe('HV-1');
    expect(c.estimate()).toBe(2);
    expect(c.preview()).toContain('Namaskara Ramesh,');
    expect(c.preview()).toContain('HV-1');
  });

  it('unreadable file shows the server message', async () => {
    create();
    api.importRecipients.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'No Phone or Email column found.' } })));
    c.upload(new File(['x'], 'bad.xlsx'));
    expect(c.error()).toContain('No Phone or Email column');
    expect(c.imported()).toBeNull();
  });

  it('sends the imported people with auto vouchers', async () => {
    create();
    c.upload(new File(['x'], 'list.xlsx'));
    c.voucherMode = 'auto';
    c.prefix = 'KIT-';
    c.start = 101;
    await c.send();
    const body = api.createCampaign.calls.mostRecent().args[0];
    expect(body.channel).toBe('whatsapp');
    expect(body.people.length).toBe(2);
    expect(body.voucher).toEqual({ mode: 'auto', prefix: 'KIT-', start: 101, digits: 4, fixed: '' });
    expect(body.message).toBe(DEFAULT_INVITE);
  });

  it('opens the progress page after sending', async () => {
    create();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    c.upload(new File(['x'], 'list.xlsx'));
    await c.send();
    expect(router.navigate).toHaveBeenCalledWith(['/admin/messages', 7]);
  });

  it('same code for everyone, or no voucher at all', async () => {
    create();
    c.upload(new File(['x'], 'list.xlsx'));
    c.voucherMode = 'fixed';
    c.fixed = 'madhugiri-kit';
    expect(c.sampleVoucher()).toBe('MADHUGIRI-KIT');
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0].voucher.mode).toBe('fixed');
    c.voucherOn = false;
    f.detectChanges();
    expect(f.nativeElement.querySelector('.warn').textContent).toContain('vouchers are switched off');
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0].voucher).toEqual({ mode: 'none' });
  });

  it('recipients by date range send the dates', async () => {
    create();
    c.source = 'range';
    c.onSource();
    c.rangeFrom = '2026-09-01';
    c.rangeTo = '2026-09-30';
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ allEnquiries: true, from: '2026-09-01', to: '2026-09-30' }));
  });

  it('checks the date order and pasted numbers', async () => {
    create();
    c.source = 'range';
    c.rangeFrom = '2026-09-30'; c.rangeTo = '2026-09-01';
    await c.send();
    expect(c.error()).toContain('on or before');
    c.source = 'pasted';
    await c.send();
    expect(c.error()).toContain('Paste at least one');
    c.pasted = '9845012345, 9123456789\n9000000001';
    expect(c.estimate()).toBe(3);
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0].pasted).toContain('9845012345');
  });

  it('asks to import first and refuses more than the limit', async () => {
    create();
    await c.send();
    expect(c.error()).toBe('Import an Excel file first.');
    c.source = 'pasted';
    c.pasted = Array.from({ length: 5001 }, (_, i) => String(9000000000 + i)).join('\n');
    await c.send();
    expect(c.error()).toContain('more than 5000');
    expect(api.createCampaign).not.toHaveBeenCalled();
  });

  it('uses the enquiries picked on the Enquiries page', async () => {
    create(NONE, { ids: [3, 5], label: '2 selected enquiries' });
    expect(c.source).toBe('given');
    expect(c.estimate()).toBe(2);
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0].enquiryIds).toEqual([3, 5]);
  });

  it('WhatsApp API: template name and language are sent; manual switch clears the template', async () => {
    create(ALL);
    c.upload(new File(['x'], 'list.xlsx'));
    c.templateName = 'kit_invite';
    c.templateLang = 'kn';
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ template: 'kit_invite', templateLang: 'kn', manual: false }));
    c.manual = true;
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0].template).toBe('');
  });

  it('picking an approved template shows the complete message for the first person', () => {
    history.replaceState({}, '');
    api = stub({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    api.whatsappTemplates.and.returnValue(of({ available: true, templates: [KIT_TEMPLATE] }));
    configure(api);
    f = TestBed.createComponent(NewCampaignComponent);
    c = f.componentInstance;
    f.detectChanges();
    c.upload(new File(['x'], 'list.xlsx'));

    const select: HTMLSelectElement = f.nativeElement.querySelector('.tpl select');
    expect([...select.options].map(o => o.textContent!.trim())).toEqual(['— Choose an approved template (1) —', 'kit_invite · Kannada']);
    expect(select.disabled).toBeFalse();
    c.chooseTemplate('kit_invite|kn');
    f.detectChanges();

    expect(c.templateName).toBe('kit_invite');
    expect(c.templateLang).toBe('kn');
    expect(c.templateParams).toEqual(['{name}', '{voucher}', '']); // {{3}} is for the admin to type
    // The free-text box is replaced by the fixed (read-only) template text and the blanks
    expect(f.nativeElement.querySelector('.tpl-body').readOnly).toBeTrue();
    expect(f.nativeElement.querySelectorAll('.var').length).toBe(3);
    expect(f.nativeElement.textContent).toContain('Exactly what the first person receives');

    c.setParam(2, 'Sunday 10 AM, Madhugiri');
    f.detectChanges();
    expect(c.preview()).toBe('Namaskara Ramesh, you are invited to the kit distribution on Sunday 10 AM, Madhugiri. Your entrance voucher: HV-1');
    expect(f.nativeElement.querySelector('.bubble').textContent).toContain('Sunday 10 AM, Madhugiri');
  });

  it('blanks can be changed (name, voucher or typed text) and are sent with the template', async () => {
    create({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    api.whatsappTemplates.and.returnValue(of({ available: true, templates: [KIT_TEMPLATE] }));
    c.loadTemplates();
    c.upload(new File(['x'], 'list.xlsx'));
    c.chooseTemplate('kit_invite|kn');

    // an empty blank stops the send with a clear message
    await c.send();
    expect(c.error()).toBe('Fill in {{3}} of the template.');
    expect(api.createCampaign).not.toHaveBeenCalled();

    c.setParam(0, 'Sri {name}');
    c.setParam(2, '20 Oct');
    expect(c.preview()).toContain('Namaskara Sri Ramesh');
    await c.send();
    expect(api.createCampaign.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({
      template: 'kit_invite', templateLang: 'kn', templateBody: KIT_TEMPLATE.body,
      templateParams: ['Sri {name}', '{voucher}', '20 Oct'],
    }));
  });

  it('without a template list: type the name, paste the text, and still see the full message', () => {
    create(ALL);
    expect(c.templates().length).toBe(0);
    c.templateName = 'kit_invite';
    f.detectChanges();
    expect(c.preview()).toContain('paste its text');
    const box: HTMLTextAreaElement = f.nativeElement.querySelector('.tpl-body');
    expect(box.readOnly).toBeFalse();
    c.templateBody = 'Hello {{1}}, voucher {{2}}';
    c.syncParams();
    f.detectChanges();
    expect(c.preview()).toBe(`Hello Ramesh, voucher KIT-${new Date().getFullYear()}-0001`);
    expect(f.nativeElement.textContent).toContain(`Template list isn't available`);
  });

  it('selecting from the dropdown puts the template text into the Message box (via the real <select>)', async () => {
    history.replaceState({}, '');
    api = stub({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    api.whatsappTemplates.and.returnValue(of({ available: true, templates: [
      KIT_TEMPLATE, { name: 'thank_you', language: 'en', status: 'APPROVED', variables: 1, body: 'Thank you {{1}} for coming!' }] }));
    configure(api);
    f = TestBed.createComponent(NewCampaignComponent);
    c = f.componentInstance;
    f.detectChanges();

    const select: HTMLSelectElement = f.nativeElement.querySelector('.tpl select');
    select.value = select.options[2].value; // thank_you · English
    select.dispatchEvent(new Event('change'));
    f.detectChanges();
    await f.whenStable(); // form controls receive their value a tick later
    f.detectChanges();

    const box: HTMLTextAreaElement = f.nativeElement.querySelector('.tpl-body');
    expect(box.value).toBe('Thank you {{1}} for coming!');
    expect(box.readOnly).toBeTrue();
    expect(f.nativeElement.textContent).toContain('from template thank_you');
    expect(c.preview()).toBe('Thank you Ramesh for coming!');

    // switching to another template replaces the message and its blanks
    select.value = select.options[1].value;
    select.dispatchEvent(new Event('change'));
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(box.value).toBe(KIT_TEMPLATE.body);
    expect(f.nativeElement.querySelectorAll('.var').length).toBe(3);
  });

  it('shows "Loading approved templates…" until MSG91 answers', async () => {
    history.replaceState({}, '');
    api = stub({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    const answer = new Subject<any>();
    api.whatsappTemplates.and.returnValue(answer);
    configure(api);
    f = TestBed.createComponent(NewCampaignComponent);
    c = f.componentInstance;
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const select: HTMLSelectElement = f.nativeElement.querySelector('.tpl select');
    expect(select.options[0].textContent).toContain('Loading approved templates');
    expect(select.disabled).toBeTrue();
    answer.next({ available: true, templates: [KIT_TEMPLATE] });
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(select.disabled).toBeFalse();
    expect(select.options.length).toBe(2);
  });

  it('no approved templates yet: says so and offers Refresh', () => {
    create({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    api.whatsappTemplates.and.returnValue(of({ available: true, templates: [] }));
    c.loadTemplates();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.tpl select').options[0].textContent).toContain('No approved templates found');
    expect(f.nativeElement.querySelector('.tpl-note').textContent).toContain('No approved templates found in MSG91 yet');

    // after approving one in MSG91, Refresh brings it in
    api.whatsappTemplates.and.returnValue(of({ available: true, templates: [KIT_TEMPLATE] }));
    (f.nativeElement.querySelector('.tpl-pick button') as HTMLButtonElement).click();
    f.detectChanges();
    expect(c.templates().length).toBe(1);
    expect(f.nativeElement.querySelector('.tpl-note')).toBeNull();
  });

  it("MSG91 errors are shown with the reason, and the name/paste fallback appears", () => {
    create({ ...ALL, whatsappProvider: 'msg91', whatsappTemplatesOnly: true });
    api.whatsappTemplates.and.returnValue(of({ available: false, templates: [], message: "Couldn't load templates: MSG91: Unauthorized" }));
    c.loadTemplates();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.tpl-note').textContent).toContain('MSG91: Unauthorized');
    expect(f.nativeElement.querySelector('.tpl select').options[0].textContent).toContain('Template list not available');
    expect(f.nativeElement.querySelector('input[placeholder="kit_invite"]')).toBeTruthy();

    // a network/server failure is reported too
    api.whatsappTemplates.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Server down' } })));
    c.loadTemplates();
    f.detectChanges();
    expect(c.templatesNote()).toContain('Server down');
    expect(c.templatesLoading()).toBeFalse();
  });

  it('switching to manual links hides the template and brings back the free-text message', () => {
    create(ALL);
    c.templateName = 'kit_invite';
    f.detectChanges();
    expect(f.nativeElement.querySelector('.tpl-body')).toBeTruthy();
    c.manual = true;
    f.detectChanges();
    expect(f.nativeElement.querySelector('.tpl-body')).toBeNull();
    expect(c.preview()).toContain('Namaskara Ramesh');
  });

  it('email adds a personalised subject', async () => {
    create(ALL);
    c.pickChannel('email');
    f.detectChanges();
    c.subject = 'Invitation for {name}';
    expect(c.previewSubject()).toBe('Invitation for Ramesh');
    expect(f.nativeElement.querySelector('.bubble.mail')).toBeTruthy();
  });

  it('server errors are shown', async () => {
    create();
    api.createCampaign.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Voucher KIT-0001 was already issued earlier.' } })));
    c.upload(new File(['x'], 'list.xlsx'));
    await c.send();
    expect(c.error()).toContain('already issued');
    expect(c.busy()).toBeFalse();
  });
});

// =====================================================================
describe('Bulk message list and progress', () => {
  it('list shows each send and which channels are connected', () => {
    const api = stub(NONE);
    configure(api);
    const f = TestBed.createComponent(CampaignsComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(f.nativeElement.querySelector('.conn').textContent).toContain('Manual links');
    expect(f.nativeElement.textContent).toContain('KIT-0001 – KIT-0002');
  });

  it('progress page polls while running and stops when done', fakeAsync(() => {
    const api = stub();
    api.campaign.and.returnValues(of(view()), of(view({}, { sent: 1, queued: 1 })), of(view({ status: 'done' }, { sent: 2, queued: 0 })));
    configure(api, { id: '7' });
    const f = TestBed.createComponent(CampaignDetailComponent);
    f.detectChanges();
    tick(2000);
    tick(2000);
    expect(f.componentInstance.v()!.campaign.status).toBe('done');
    const calls = api.campaign.calls.count();
    tick(6000);
    expect(api.campaign.calls.count()).toBe(calls);
    f.destroy();
    discardPeriodicTasks();
  }));

  it('pause / cancel / retry / export buttons', async () => {
    const api = stub();
    configure(api, { id: '7' });
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    spyOn(HTMLAnchorElement.prototype, 'click');
    const c = TestBed.createComponent(CampaignDetailComponent).componentInstance;
    c.act('pause');
    expect(api.campaignAction).toHaveBeenCalledWith(7, 'pause');
    await c.act('cancel');
    expect(api.campaignAction).toHaveBeenCalledWith(7, 'cancel');
    c.act('retry-failed');
    expect(api.campaignAction).toHaveBeenCalledWith(7, 'retry-failed');
    c.export();
    expect(api.exportCampaign).toHaveBeenCalledWith(7);
  });

  it('manual WhatsApp: "Open next" opens the chat with the personal message and marks it sent', () => {
    const api = stub();
    api.campaign.and.returnValue(of(view({ mode: 'manual', status: 'manual' }, { manual: 1, queued: 0 })));
    configure(api, { id: '7' });
    spyOn(window, 'open');
    const f = TestBed.createComponent(CampaignDetailComponent);
    f.detectChanges();
    f.componentInstance.openNext();
    expect(window.open).toHaveBeenCalledWith('https://wa.me/919845012345?text=Namaskara%20Ramesh%2C%20voucher%20KIT-0001', '_blank', 'noopener');
    expect(api.manualSent).toHaveBeenCalledWith(7, 1);
    expect(f.componentInstance.rows()[0].status).toBe('sent');
  });
});

// =====================================================================
describe('Inbox', () => {
  it('lists conversations with unread counts and opens a thread', fakeAsync(() => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.thr .badge').textContent).toBe('2');
    f.nativeElement.querySelector('.thr').click();
    f.detectChanges();
    expect(api.thread).toHaveBeenCalledWith('whatsapp', '919845012345');
    const bubbles = f.nativeElement.querySelectorAll('.msg');
    expect(bubbles.length).toBe(2);
    expect(bubbles[0].classList.contains('out')).toBeFalse();
    expect(bubbles[1].classList.contains('out')).toBeTrue();
    expect(bubbles[1].querySelector('.tick').textContent).toBe('✓✓');
    expect(f.componentInstance.threads()[0].unread).toBe(0);
    f.destroy();
    discardPeriodicTasks();
  }));

  it('replies go out on the same channel', fakeAsync(() => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.openThread(c.threads()[0]);
    c.replyText = 'Thanks';
    c.send();
    expect(api.reply).toHaveBeenCalledWith({ channel: 'whatsapp', contact: '919845012345', subject: '', text: 'Thanks' });
    expect(c.messages().length).toBe(3);
    expect(c.replyText).toBe('');
    f.destroy();
    discardPeriodicTasks();
  }));

  it('manual WhatsApp reply opens the chat link', fakeAsync(() => {
    const api = stub();
    api.reply.and.returnValue(of({ message: msg({ id: 13 }), link: 'https://wa.me/919845012345?text=Hi' }));
    configure(api);
    spyOn(window, 'open');
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.openThread(c.threads()[0]);
    c.replyText = 'Hi';
    c.send();
    expect(window.open).toHaveBeenCalledWith('https://wa.me/919845012345?text=Hi', '_blank', 'noopener');
    f.destroy();
    discardPeriodicTasks();
  }));

  it('SMS conversations explain why there is no reply box', fakeAsync(() => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    f.componentInstance.openThread({ ...f.componentInstance.threads()[0], channel: 'sms' });
    f.detectChanges();
    expect(f.nativeElement.querySelector('.compose')).toBeNull();
    expect(f.nativeElement.querySelector('.thread').textContent).toContain('DLT-approved template');
    f.destroy();
    discardPeriodicTasks();
  }));

  it('channel chips and the "All messages" log filter received vs sent', fakeAsync(() => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.channel = 'email';
    c.reload();
    expect(api.threads.calls.mostRecent().args[0]).toBe('email');
    c.tab.set('log');
    c.direction = 'in';
    c.loadLog(0);
    expect(api.messageLog.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ channel: 'email', direction: 'in' }));
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    f.destroy();
    discardPeriodicTasks();
  }));

  it('refreshes every 15 seconds for new messages', fakeAsync(() => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(InboxComponent);
    f.detectChanges();
    const before = api.threads.calls.count();
    tick(15000);
    expect(api.threads.calls.count()).toBe(before + 1);
    f.destroy();
    discardPeriodicTasks();
  }));
});

// =====================================================================
describe('Voucher check-in', () => {
  it('finds a voucher and marks the person attended', () => {
    const api = stub();
    configure(api);
    const f = TestBed.createComponent(VouchersComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.code = ' kit-0001 ';
    c.find();
    f.detectChanges();
    expect(api.findVoucher).toHaveBeenCalledWith('kit-0001');
    expect(f.nativeElement.querySelector('.result h2').textContent).toBe('Ramesh');
    f.nativeElement.querySelector('.result .btn-wa').click();
    f.detectChanges();
    expect(api.attend).toHaveBeenCalledWith(1);
    expect(f.nativeElement.querySelector('.already').textContent).toContain('Already checked in');
    expect(c.recent().length).toBe(1);
    expect(c.code).toBe('');
  });

  it('unknown voucher says so', () => {
    const api = stub();
    api.findVoucher.and.returnValue(of([]));
    configure(api);
    const f = TestBed.createComponent(VouchersComponent);
    f.componentInstance.code = 'nope';
    f.componentInstance.find();
    expect(f.componentInstance.error()).toBe('No voucher "NOPE" found.');
  });

  it('second check-in shows the server warning', () => {
    const api = stub();
    api.attend.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Already checked in at 2026-10-12 10:05' } })));
    configure(api);
    const c = TestBed.createComponent(VouchersComponent).componentInstance;
    c.attend(msg());
    expect(c.error()).toContain('Already checked in');
  });
});
