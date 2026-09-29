import { ConfirmService } from '../core/confirm.service';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { AdminPostsComponent } from './posts.component';
import { AdminGalleryComponent } from './gallery.component';
import { AdminTimelineComponent } from './timeline.component';
import { SettingsComponent } from './settings.component';
import { AdminShellComponent } from './admin-shell.component';
import { EnquiriesComponent } from './enquiries.component';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Enquiry, Post } from '../core/models';

function fdToObject(fd: FormData) {
  const o: Record<string, unknown> = {};
  fd.forEach((v, k) => { o[k] = o[k] === undefined ? v : [].concat(o[k] as never, v as never); });
  return o;
}

function setup(api: object, extra: any[] = []) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminApi, useValue: api },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }, ...extra],
  });
}

// =====================================================================
describe('Admin: Press, My Views & Stalwart Says', () => {
  const post: Post = { id: 4, section: 'press', category: 'news', titleEn: 'Job Mela', titleKn: 'ಉದ್ಯೋಗ ಮೇಳ', bodyEn: 'Body', image: '/uploads/a.png', publishedOn: '2026-09-20' };
  function api() {
    return {
      posts: jasmine.createSpy('posts').and.returnValue(of({ items: [post], total: 1, page: 0, size: 20 })),
      savePost: jasmine.createSpy('savePost').and.returnValue(of(post)),
      deletePost: jasmine.createSpy('deletePost').and.returnValue(of({})),
    };
  }

  it('lists posts and filters by section/category', () => {
    const a = api();
    setup(a);
    const f = TestBed.createComponent(AdminPostsComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    f.componentInstance.fSection = 'views';
    f.componentInstance.fCategory = 'quotes';
    f.componentInstance.load(0);
    expect(a.posts).toHaveBeenCalledWith('views', 'quotes', 0);
  });

  it('new post defaults to today and the first category of the section', () => {
    setup(api());
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    c.fSection = 'views';
    c.edit();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(c.form()!.section).toBe('views');
    expect(c.form()!.category).toBe('quotes');
    expect(c.form()!.id).toBeNull();
    expect(c.form()!.publishedOn.length).toBe(10);
    expect([today, new Date().toISOString().slice(0, 10)]).toContain(c.form()!.publishedOn);
  });

  it('edit window: Save bar always visible, clicking outside keeps the edits, ✕ and Esc close', () => {
    setup(api());
    const f = TestBed.createComponent(AdminPostsComponent);
    f.detectChanges();
    f.nativeElement.querySelector('tbody .icon-btn:not(.danger)').click();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.modal-head h2')!.textContent).toBe('Edit post');
    expect(el.querySelector('.modal-foot .btn-maroon')!.textContent).toContain('Save changes');
    expect(getComputedStyle(el.querySelector('.modal-body')!).overflowY).toBe('auto');
    f.componentInstance.form()!.titleEn = 'Half-typed edit';
    (el.querySelector('.modal-bg') as HTMLElement).click();
    f.detectChanges();
    expect(f.componentInstance.form()?.titleEn).toBe('Half-typed edit'); // not thrown away
    (el.querySelector('.modal-x') as HTMLElement).click();
    f.detectChanges();
    expect(el.querySelector('.modal')).toBeNull();
    f.componentInstance.edit();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(f.componentInstance.form()).toBeNull();
  });

  it('clicking Save changes in the window saves', () => {
    const a = api();
    setup(a);
    const f = TestBed.createComponent(AdminPostsComponent);
    f.detectChanges();
    f.componentInstance.edit(post);
    f.detectChanges();
    f.nativeElement.querySelector('.modal-foot .btn-maroon').click();
    expect(a.savePost).toHaveBeenCalledWith(4, jasmine.any(FormData));
    f.detectChanges();
    expect(f.componentInstance.toast()).toBe('Changes saved');
  });

  it('English title is required', () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    c.edit();
    c.save(c.form()!);
    expect(c.error()).toBe('English title is required');
    expect(a.savePost).not.toHaveBeenCalled();
  });

  it('saves every field plus the chosen image as multipart', () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    c.edit(post);
    const img = new File(['x'], 'cover.png', { type: 'image/png' });
    c.pick({ target: { files: [img] } } as any);
    expect(c.preview()).toContain('blob:');
    c.save({ ...c.form()!, titleEn: 'Edited' });
    const [id, fd] = a.savePost.calls.mostRecent().args;
    const o = fdToObject(fd);
    expect(id).toBe(4);
    expect(o['titleEn']).toBe('Edited');
    expect(o['titleKn']).toBe('ಉದ್ಯೋಗ ಮೇಳ');
    expect(o['section']).toBe('press');
    expect(o['removeImage']).toBe('false');
    expect((o['image'] as File).name).toBe('cover.png');
    expect(c.form()).toBeNull();
  });

  it('a second message is not cut short by the first one\'s timer', fakeAsync(() => {
    setup(api());
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    c.edit(post);
    c.save(c.form()!);          // "Changes saved" at t=0
    tick(2000);
    c.edit(post);
    c.save(c.form()!);          // new message at t=2000
    tick(1000);                 // t=3000: the first timer (2600) must not have cleared it
    expect(c.toast()).toBe('Changes saved');
    tick(2000);
    expect(c.toast()).toBe('');
  }));

  it('delete: Cancel in the popup keeps the post', async () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    const ask = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
    await c.remove(post);
    expect(ask.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ title: 'Delete this post?', detail: 'Job Mela', danger: true }));
    expect(a.deletePost).not.toHaveBeenCalled();
  });

  it('delete failure is reported', async () => {
    const a = api();
    a.deletePost.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500, error: {} })));
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    await c.remove(post);
    expect(c.toast()).toBe('Could not delete');
    expect(c.toastErr).toBeTrue();
  });

  it('shows the server error when saving fails', () => {
    const a = api();
    a.savePost.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Only JPG, PNG, WEBP or GIF images are allowed' } })));
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    c.edit(post);
    c.save(c.form()!);
    expect(c.error()).toContain('Only JPG');
    expect(c.busy()).toBeFalse();
  });

  it('delete asks first', async () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminPostsComponent).componentInstance;
    const confirm = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
    await c.remove(post);
    expect(a.deletePost).not.toHaveBeenCalled();
    confirm.and.resolveTo(true);
    await c.remove(post);
    expect(a.deletePost).toHaveBeenCalledWith(4);
  });
});

// =====================================================================
describe('Admin: Gallery', () => {
  function api() {
    return {
      gallery: jasmine.createSpy('gallery').and.returnValue(of([{ id: 1, category: 'timeline', image: '/a.jpg', captionEn: 'A' }])),
      uploadPhotos: jasmine.createSpy('uploadPhotos').and.returnValue(of([{}, {}])),
      updatePhoto: jasmine.createSpy('updatePhoto').and.returnValue(of({})),
      deletePhoto: jasmine.createSpy('deletePhoto').and.returnValue(of({})),
    };
  }

  it('uploads several photos with album and captions', () => {
    const a = api();
    setup(a);
    const f = TestBed.createComponent(AdminGalleryComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.category = 'election-rally';
    c.captionEn = 'Rally';
    c.captionKn = 'ರ‍್ಯಾಲಿ';
    c.pick({ target: { files: [new File(['1'], '1.jpg'), new File(['2'], '2.jpg')] } } as any);
    c.upload();
    const o = fdToObject(a.uploadPhotos.calls.mostRecent().args[0]);
    expect(o['category']).toBe('election-rally');
    expect(o['captionKn']).toBe('ರ‍್ಯಾಲಿ');
    expect((o['images'] as File[]).length).toBe(2);
    expect(c.files().length).toBe(0);
    expect(c.toast()).toBe('2 uploaded');
  });

  it('drag-and-drop keeps only images', () => {
    setup(api());
    const c = TestBed.createComponent(AdminGalleryComponent).componentInstance;
    const dt = new DataTransfer();
    dt.items.add(new File(['1'], 'a.png', { type: 'image/png' }));
    dt.items.add(new File(['2'], 'b.pdf', { type: 'application/pdf' }));
    c.drop({ preventDefault() {}, dataTransfer: dt } as any);
    expect(c.files().map(x => x.name)).toEqual(['a.png']);
  });

  it('upload error is shown', () => {
    const a = api();
    a.uploadPhotos.and.returnValue(throwError(() => new HttpErrorResponse({ status: 413, error: { message: 'Image must be under 10 MB' } })));
    setup(a);
    const c = TestBed.createComponent(AdminGalleryComponent).componentInstance;
    c.pick({ target: { files: [new File(['1'], '1.jpg')] } } as any);
    c.upload();
    expect(c.error()).toBe('Image must be under 10 MB');
  });

  it('Save on a photo card sends the edited caption and album; errors are shown', () => {
    const a = api();
    setup(a);
    const f = TestBed.createComponent(AdminGalleryComponent);
    f.detectChanges();
    const card = f.nativeElement.querySelector('.ph') as HTMLElement;
    const cap = card.querySelectorAll('input')[0] as HTMLInputElement;
    cap.value = 'New caption';
    cap.dispatchEvent(new Event('input'));
    f.detectChanges();
    [...card.querySelectorAll('button')].find(b => b.textContent!.trim() === 'Save')!.click();
    expect(a.updatePhoto).toHaveBeenCalledWith(1, jasmine.objectContaining({ captionEn: 'New caption', category: 'timeline' }));
    expect(f.componentInstance.toast()).toBe('Photo details saved');

    a.updatePhoto.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Unknown gallery category' } })));
    f.componentInstance.save({ id: 1, category: 'x', image: '/a.jpg' });
    expect(f.componentInstance.toast()).toBe('Unknown gallery category');
  });

  it('moving a photo out of the album being viewed refreshes the list', () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminGalleryComponent).componentInstance;
    c.filter = 'timeline';
    a.gallery.calls.reset();
    c.save({ id: 1, category: 'spiritual-side', image: '/a.jpg' });
    expect(a.gallery).toHaveBeenCalledWith('timeline');
  });

  it('recaption, filter and delete', async () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminGalleryComponent).componentInstance;
    c.save({ id: 1, category: 'spiritual-side', image: '/a.jpg', captionEn: 'Temple', captionKn: 'ದೇವಸ್ಥಾನ' });
    expect(a.updatePhoto).toHaveBeenCalledWith(1, { category: 'spiritual-side', captionEn: 'Temple', captionKn: 'ದೇವಸ್ಥಾನ' });
    c.filter = 'timeline';
    c.load();
    expect(a.gallery).toHaveBeenCalledWith('timeline');
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    await c.remove({ id: 1, category: 'timeline', image: '/a.jpg' });
    expect(a.deletePhoto).toHaveBeenCalledWith(1);
  });
});

// =====================================================================
describe('Admin: Timeline', () => {
  function api() {
    return {
      timeline: jasmine.createSpy('timeline').and.returnValue(of([{ id: 1, titleEn: 'A', sortOrder: 0 }, { id: 2, titleEn: 'B', sortOrder: 5 }])),
      saveTimeline: jasmine.createSpy('saveTimeline').and.returnValue(of({})),
      deleteTimeline: jasmine.createSpy('deleteTimeline').and.returnValue(of({})),
    };
  }

  it('new milestone goes after the last one', () => {
    setup(api());
    const f = TestBed.createComponent(AdminTimelineComponent);
    f.detectChanges();
    f.componentInstance.edit();
    expect(f.componentInstance.draft()!.sortOrder).toBe(6);
    expect(f.componentInstance.draft()!.id).toBeNull();
  });

  it('requires an English title, then saves without sending the id in the body', () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminTimelineComponent).componentInstance;
    c.edit();
    c.save(c.draft()!);
    expect(c.error()).toBe('English title is required');
    c.edit({ id: 2, titleEn: 'Chairman', titleKn: 'ಅಧ್ಯಕ್ಷರು', period: '2015', sortOrder: 5 });
    c.save(c.draft()!);
    const [id, body] = a.saveTimeline.calls.mostRecent().args;
    expect(id).toBe(2);
    expect(body).toEqual({ titleEn: 'Chairman', titleKn: 'ಅಧ್ಯಕ್ಷರು', period: '2015', sortOrder: 5 });
    expect(c.draft()).toBeNull();
  });

  it('edit window saves from its pinned footer and says so', () => {
    const a = api();
    setup(a);
    const f = TestBed.createComponent(AdminTimelineComponent);
    f.detectChanges();
    f.nativeElement.querySelector('tbody .icon-btn:not(.danger)').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.modal-head h2').textContent).toBe('Edit milestone');
    f.nativeElement.querySelector('.modal-bg').click();
    f.detectChanges();
    expect(f.componentInstance.draft()).not.toBeNull();
    f.nativeElement.querySelector('.modal-foot .btn-maroon').click();
    expect(a.saveTimeline).toHaveBeenCalledWith(1, jasmine.objectContaining({ titleEn: 'A' }));
    expect(f.componentInstance.toast()).toBe('Changes saved');
  });

  it('delete asks first', async () => {
    const a = api();
    setup(a);
    const c = TestBed.createComponent(AdminTimelineComponent).componentInstance;
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    await c.remove({ id: 2, titleEn: 'B' });
    expect(a.deleteTimeline).toHaveBeenCalledWith(2);
  });
});

// =====================================================================
describe('Admin: Settings', () => {
  function make() {
    const a = {
      settings: jasmine.createSpy('settings').and.returnValue(of({ phone: '9900123406', facebook: '' })),
      saveSettings: jasmine.createSpy('saveSettings').and.callFake((s: any) => of(s)),
      changePassword: jasmine.createSpy('changePassword').and.returnValue(of({})),
    };
    const pub = { refreshSettings: jasmine.createSpy('refreshSettings') };
    setup(a, [{ provide: ApiService, useValue: pub }]);
    const f = TestBed.createComponent(SettingsComponent);
    f.detectChanges();
    return { a, pub, c: f.componentInstance };
  }

  it('social links must be full https links', () => {
    const { a, c } = make();
    c.save({ facebook: 'facebook.com/x' });
    expect(c.msg()).toContain('facebook must start with https://');
    expect(a.saveSettings).not.toHaveBeenCalled();
  });

  it('saving refreshes the public site settings', () => {
    const { a, pub, c } = make();
    c.save({ facebook: 'https://facebook.com/halappafoundation' });
    expect(a.saveSettings).toHaveBeenCalled();
    expect(pub.refreshSettings).toHaveBeenCalled();
    expect(c.msg()).toContain('Saved');
  });

  it('password: at least 8 characters and both entries must match', () => {
    const { a, c } = make();
    c.cur = 'old'; c.nw = 'short'; c.nw2 = 'short';
    c.changePw();
    expect(c.pwMsg()).toContain('at least 8');
    c.nw = 'NewPass@123'; c.nw2 = 'Different@1';
    c.changePw();
    expect(c.pwMsg()).toBe('Passwords do not match');
    c.nw2 = 'NewPass@123';
    c.changePw();
    expect(a.changePassword).toHaveBeenCalledWith('old', 'NewPass@123');
    expect(c.pwMsg()).toBe('Password changed successfully');
    expect(c.pwOk()).toBeTrue();
    expect(c.cur).toBe('');
  });

  it('success shows a green box with a tick; errors a red box', () => {
    const { a } = make();
    const f = TestBed.createComponent(SettingsComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.cur = 'old'; c.nw = 'short'; c.nw2 = 'short';
    c.changePw(); f.detectChanges();
    let box = f.nativeElement.querySelectorAll('.alert')[0] as HTMLElement;
    expect(box.classList.contains('bad')).toBeTrue();
    expect(box.textContent).toContain('at least 8 characters');

    // Show the new password with the eye, then change it: boxes go back to dots.
    const eye = f.nativeElement.querySelectorAll('.pw app-eye button')[1] as HTMLButtonElement;
    eye.click(); f.detectChanges();
    expect((f.nativeElement.querySelector('#pw-new') as HTMLInputElement).type).toBe('text');
    c.nw = c.nw2 = 'NewPass@123';
    c.changePw(); f.detectChanges();
    box = f.nativeElement.querySelector('.alert') as HTMLElement;
    expect(box.classList.contains('ok')).toBeTrue();
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toContain('Password changed successfully');
    expect(box.querySelector('app-icon')).toBeTruthy();
    expect((f.nativeElement.querySelector('#pw-new') as HTMLInputElement).type).toBe('password');
    expect(a.changePassword).toHaveBeenCalled();
  });

  it('asks for the current password and refuses reusing it', () => {
    const { a, c } = make();
    c.nw = c.nw2 = 'NewPass@123';
    c.changePw();
    expect(c.pwMsg()).toBe('Enter your current password');
    c.cur = 'NewPass@123';
    c.changePw();
    expect(c.pwMsg()).toBe('New password must be different from the current one');
    expect(a.changePassword).not.toHaveBeenCalled();
  });

  it('wrong current password shows the server message', () => {
    const { a, c } = make();
    a.changePassword.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Current password is wrong' } })));
    c.cur = 'x'; c.nw = c.nw2 = 'NewPass@123';
    c.changePw();
    expect(c.pwMsg()).toBe('Current password is wrong');
  });
});

// =====================================================================
describe('Admin: menu', () => {
  it('shows every section and the unread badge on Inbox', () => {
    const a = { unread: jasmine.createSpy('unread').and.returnValue(of({ unread: 4 })) };
    const auth = { user: () => 'admin', logout: jasmine.createSpy('logout') };
    setup(a, [{ provide: AuthService, useValue: auth }]);
    const f = TestBed.createComponent(AdminShellComponent);
    f.detectChanges();
    const labels = [...f.nativeElement.querySelectorAll('.side nav a')].map((x: any) => x.textContent.replace(/\d+/g, '').trim());
    expect(labels).toEqual(['Dashboard', 'Enquiries', 'Inbox', 'Bulk messages', 'Voucher check-in', 'Press & Views', 'Gallery', 'Timeline', 'Settings']);
    expect(f.nativeElement.querySelector('.badge').textContent).toBe('4');
    f.nativeElement.querySelector('.foot button').click();
    expect(auth.logout).toHaveBeenCalled();
    f.destroy();
  });

  it('no badge when nothing is unread, and the phone menu toggles', () => {
    const a = { unread: jasmine.createSpy('unread').and.returnValue(of({ unread: 0 })) };
    setup(a, [{ provide: AuthService, useValue: { user: () => 'admin', logout() {} } }]);
    const f = TestBed.createComponent(AdminShellComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.badge')).toBeNull();
    f.nativeElement.querySelector('.burger').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.shell').classList.contains('open')).toBeTrue();
    f.destroy();
  });
});

// =====================================================================
describe('Admin: Enquiries row actions', () => {
  const rows: Enquiry[] = [
    { id: 1, name: 'A', phone: '9845012345', message: 'm', channel: 'email', status: 'new', createdAt: '2026-09-29T10:00:00' },
    { id: 2, name: 'B', phone: '9123456789', message: 'm', channel: 'whatsapp', status: 'new', createdAt: '2026-09-29T10:00:00' },
  ];
  function make() {
    const a = {
      enquiries: jasmine.createSpy('enquiries').and.returnValue(of({ items: rows, total: 60, page: 0, size: 25 })),
      updateEnquiry: jasmine.createSpy('updateEnquiry').and.callFake((_id: number, b: any) => of({ ...rows[0], ...b })),
      deleteEnquiries: jasmine.createSpy('deleteEnquiries').and.returnValue(of({})),
      exportEnquiries: jasmine.createSpy('exportEnquiries').and.returnValue(of({ blob: new Blob(['x']), name: 'e.xlsx' })),
    };
    setup(a);
    const f = TestBed.createComponent(EnquiriesComponent);
    f.detectChanges();
    return { a, f, c: f.componentInstance };
  }

  it('changing status saves it', () => {
    const { a, c } = make();
    const e = { ...rows[0] };
    c.setStatus(e, 'resolved');
    expect(a.updateEnquiry).toHaveBeenCalledWith(1, { status: 'resolved' });
    expect(e.status).toBe('resolved');
  });

  it('bulk status, notes and delete for ticked rows', async () => {
    const { a, c } = make();
    c.togglePage(true);
    expect(c.allOnPage()).toBeTrue();
    c.bulkStatus('in-progress');
    expect(a.updateEnquiry).toHaveBeenCalledTimes(2);
    c.saveNotes({ ...rows[0], notes: 'Called back' });
    expect(a.updateEnquiry).toHaveBeenCalledWith(1, { notes: 'Called back' });
    spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(true);
    await c.remove();
    expect(a.deleteEnquiries).toHaveBeenCalledWith([1, 2]);
    expect(c.selected.size).toBe(0);
  });

  it('status dropdown in the table saves on change, and snaps back if the save fails', () => {
    const { a, f } = make();
    const sel = f.nativeElement.querySelector('select.st') as HTMLSelectElement;
    sel.value = 'resolved';
    sel.dispatchEvent(new Event('change'));
    expect(a.updateEnquiry).toHaveBeenCalledWith(1, { status: 'resolved' });

    a.updateEnquiry.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Unknown status' } })));
    sel.value = 'in-progress';
    sel.dispatchEvent(new Event('change'));
    expect(sel.value).toBe('resolved'); // back to the last status that was actually saved
    expect(f.componentInstance.toast()).toBe('Unknown status');
  });

  it('bulk status reports partial failures', () => {
    const { a, c } = make();
    a.updateEnquiry.and.callFake((id: number) => id === 2 ? throwError(() => new Error('x')) : of({}));
    c.togglePage(true);
    c.bulkStatus('resolved');
    expect(c.toast()).toBe('1 updated, 1 failed');
    expect(c.toastErr).toBeTrue();
  });

  it('notes box saves what was typed', () => {
    const { a, f } = make();
    f.nativeElement.querySelector('button.link').click();
    f.detectChanges();
    const ta = f.nativeElement.querySelector('textarea.notes') as HTMLTextAreaElement;
    ta.value = 'Will call on Monday';
    ta.dispatchEvent(new Event('input'));
    [...f.nativeElement.querySelectorAll('button')].find((b: any) => b.textContent.includes('Save notes')).click();
    expect(a.updateEnquiry).toHaveBeenCalledWith(1, { notes: 'Will call on Monday' });
  });

  it('delete asks in the popup; "Cancel" keeps everything', async () => {
    const { a, c } = make();
    const ask = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(false);
    c.toggle(1);
    await c.remove();
    expect(ask.calls.mostRecent().args[0].title).toBe('Delete 1 enquiry?');
    expect(a.deleteEnquiries).not.toHaveBeenCalled();
    expect(c.selected.size).toBe(1);
  });

  it('paging, search reset and clear', () => {
    const { a, c } = make();
    expect(c.pages()).toBe(3);
    c.go(2);
    expect(a.enquiries.calls.mostRecent().args[1]).toBe(2);
    c.q.q = 'ramesh';
    c.search();
    expect(c.page).toBe(0);
    expect(a.enquiries.calls.mostRecent().args[0].q).toBe('ramesh');
    c.clear();
    expect(c.q.q).toBe('');
  });

  it('Excel button exports the ticked rows only', () => {
    const { a, c } = make();
    spyOn(HTMLAnchorElement.prototype, 'click');
    c.toggle(2);
    c.export();
    expect(a.exportEnquiries).toHaveBeenCalledWith(c.q, [2]);
  });
});
