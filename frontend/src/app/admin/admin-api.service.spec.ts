import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminApi, downloadBlob } from './admin-api.service';

/** Every admin API call hits the right URL with the right method and parameters. */
describe('AdminApi endpoints', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function expectCall(run: () => void, method: string, url: string, check?: (r: any) => void) {
    run();
    const req = http.expectOne(r => r.url === url);
    expect(req.request.method).withContext(url).toBe(method);
    check?.(req.request);
    req.flush(req.request.responseType === 'blob' ? new Blob(['x']) : {});
  }

  it('dashboard and enquiries', () => {
    expectCall(() => api.dashboard().subscribe(), 'GET', '/api/admin/dashboard');
    expectCall(() => api.enquiries({ status: 'new', q: '' }, 2, 25).subscribe(), 'GET', '/api/admin/enquiries', r => {
      expect(r.params.get('status')).toBe('new');
      expect(r.params.has('q')).toBeFalse();
      expect(r.params.get('page')).toBe('2');
    });
    expectCall(() => api.updateEnquiry(3, { status: 'resolved' }).subscribe(), 'PATCH', '/api/admin/enquiries/3', r => expect(r.body).toEqual({ status: 'resolved' }));
    expectCall(() => api.deleteEnquiries([1, 2]).subscribe(), 'POST', '/api/admin/enquiries/delete', r => expect(r.body).toEqual({ ids: [1, 2] }));
  });

  it('bulk messages', () => {
    expectCall(() => api.channels().subscribe(), 'GET', '/api/admin/campaigns/channels');
    expectCall(() => api.importRecipients(new File(['x'], 'l.xlsx')).subscribe(), 'POST', '/api/admin/campaigns/import', r => {
      expect(r.body instanceof FormData).toBeTrue();
      expect((r.body as FormData).get('file')).toBeTruthy();
    });
    expectCall(() => api.recipientsTemplate().subscribe(), 'GET', '/api/admin/campaigns/template', r => expect(r.responseType).toBe('blob'));
    expectCall(() => api.campaigns().subscribe(), 'GET', '/api/admin/campaigns');
    expectCall(() => api.campaign(7).subscribe(), 'GET', '/api/admin/campaigns/7');
    expectCall(() => api.createCampaign({ name: 'x' }).subscribe(), 'POST', '/api/admin/campaigns', r => expect(r.body).toEqual({ name: 'x' }));
    expectCall(() => api.campaignRecipients(7, 'failed', 'ram', 1).subscribe(), 'GET', '/api/admin/campaigns/7/recipients', r => {
      expect(r.params.get('status')).toBe('failed');
      expect(r.params.get('q')).toBe('ram');
      expect(r.params.get('size')).toBe('50');
    });
    for (const a of ['pause', 'resume', 'cancel', 'retry-failed'] as const) {
      expectCall(() => api.campaignAction(7, a).subscribe(), 'POST', `/api/admin/campaigns/7/${a}`);
    }
    expectCall(() => api.exportCampaign(7).subscribe(), 'GET', '/api/admin/campaigns/7/export');
    expectCall(() => api.manualSent(7, 9).subscribe(), 'POST', '/api/admin/campaigns/7/recipients/9/manual-sent');
  });

  it('inbox and vouchers', () => {
    expectCall(() => api.threads('whatsapp', '', true, 0).subscribe(), 'GET', '/api/admin/inbox/threads', r => {
      expect(r.params.get('channel')).toBe('whatsapp');
      expect(r.params.get('includeSentOnly')).toBe('true');
    });
    expectCall(() => api.thread('email', 'a@b.com').subscribe(), 'GET', '/api/admin/inbox/thread', r => expect(r.params.get('contact')).toBe('a@b.com'));
    expectCall(() => api.unread().subscribe(), 'GET', '/api/admin/inbox/unread');
    expectCall(() => api.messageLog({ direction: 'in' }, 0).subscribe(), 'GET', '/api/admin/inbox/messages', r => expect(r.params.get('direction')).toBe('in'));
    expectCall(() => api.reply({ channel: 'whatsapp', contact: '91', text: 'hi' }).subscribe(), 'POST', '/api/admin/inbox/reply');
    expectCall(() => api.findVoucher('KIT-1').subscribe(), 'GET', '/api/admin/vouchers', r => expect(r.params.get('code')).toBe('KIT-1'));
    expectCall(() => api.attend(5).subscribe(), 'POST', '/api/admin/vouchers/5/attend');
  });

  it('content and settings', () => {
    expectCall(() => api.posts('press', '', 0).subscribe(), 'GET', '/api/admin/posts', r => expect(r.params.has('category')).toBeFalse());
    expectCall(() => api.savePost(null, new FormData()).subscribe(), 'POST', '/api/admin/posts');
    expectCall(() => api.savePost(4, new FormData()).subscribe(), 'PUT', '/api/admin/posts/4');
    expectCall(() => api.deletePost(4).subscribe(), 'DELETE', '/api/admin/posts/4');
    expectCall(() => api.gallery('timeline').subscribe(), 'GET', '/api/admin/gallery');
    expectCall(() => api.uploadPhotos(new FormData()).subscribe(), 'POST', '/api/admin/gallery');
    expectCall(() => api.updatePhoto(1, { captionEn: 'x' }).subscribe(), 'PUT', '/api/admin/gallery/1');
    expectCall(() => api.deletePhoto(1).subscribe(), 'DELETE', '/api/admin/gallery/1');
    expectCall(() => api.timeline().subscribe(), 'GET', '/api/admin/timeline');
    expectCall(() => api.saveTimeline(null, { titleEn: 'x' }).subscribe(), 'POST', '/api/admin/timeline');
    expectCall(() => api.saveTimeline(2, { titleEn: 'x' }).subscribe(), 'PUT', '/api/admin/timeline/2');
    expectCall(() => api.deleteTimeline(2).subscribe(), 'DELETE', '/api/admin/timeline/2');
    expectCall(() => api.settings().subscribe(), 'GET', '/api/admin/settings');
    expectCall(() => api.saveSettings({ phone: '1' }).subscribe(), 'PUT', '/api/admin/settings');
    expectCall(() => api.changePassword('a', 'b').subscribe(), 'POST', '/api/auth/change-password', r => expect(r.body).toEqual({ current: 'a', next: 'b' }));
  });

  it('downloadBlob saves the file with the given name', () => {
    const click = spyOn(HTMLAnchorElement.prototype, 'click');
    downloadBlob(new Blob(['x']), 'report.xlsx');
    const a = click.calls.mostRecent().object as HTMLAnchorElement;
    expect(a.download).toBe('report.xlsx');
    expect(a.href).toContain('blob:');
  });
});
