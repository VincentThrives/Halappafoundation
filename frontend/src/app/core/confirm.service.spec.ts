import { TestBed } from '@angular/core/testing';
import { ConfirmService } from './confirm.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('Confirmation popup', () => {
  let svc: ConfirmService;

  function render() {
    const f = TestBed.createComponent(ConfirmDialogComponent);
    f.detectChanges();
    return f;
  }

  beforeEach(() => { svc = TestBed.inject(ConfirmService); });

  it('shows title, highlighted item and message; Delete answers yes', async () => {
    const answer = svc.ask({ title: 'Delete this post?', detail: 'Job Mela', message: 'This cannot be undone.', danger: true });
    const f = render();
    const box = f.nativeElement.querySelector('.box') as HTMLElement;
    expect(box.classList.contains('danger')).toBeTrue();
    expect(box.querySelector('h2')!.textContent).toBe('Delete this post?');
    expect(box.querySelector('.detail')!.textContent).toBe('Job Mela');
    expect(box.querySelector('.ok')!.textContent).toBe('Delete');
    (box.querySelector('.ok') as HTMLButtonElement).click();
    expect(await answer).toBeTrue();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.box')).toBeNull();
  });

  it('Cancel, clicking outside and Esc all answer no', async () => {
    let a = svc.ask({ title: 'Delete?' });
    let f = render();
    f.nativeElement.querySelector('.cancel').click();
    expect(await a).toBeFalse();

    a = svc.ask({ title: 'Delete?' });
    f.detectChanges();
    f.nativeElement.querySelector('.bg').click();
    expect(await a).toBeFalse();

    a = svc.ask({ title: 'Delete?' });
    f.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(await a).toBeFalse();
  });

  it('clicking inside the box does not close it', () => {
    svc.ask({ title: 'Delete?' });
    const f = render();
    (f.nativeElement.querySelector('.box') as HTMLElement).click();
    f.detectChanges();
    expect(svc.current()).not.toBeNull();
  });

  it('the main button gets focus so Enter confirms', () => {
    svc.ask({ title: 'Send?' });
    const f = render();
    f.detectChanges();
    expect(document.activeElement).toBe(f.nativeElement.querySelector('.ok'));
  });

  it('custom button texts and icon for non-destructive questions', () => {
    svc.ask({ title: 'Send to 5000 people?', confirmText: 'Send now', cancelText: 'Not yet', icon: 'send' });
    const f = render();
    expect(f.nativeElement.querySelector('.box').classList.contains('danger')).toBeFalse();
    expect(f.nativeElement.querySelector('.ok').textContent).toBe('Send now');
    expect(f.nativeElement.querySelector('.cancel').textContent).toBe('Not yet');
  });

  it('a new question replaces an unanswered one (the old one counts as no)', async () => {
    const first = svc.ask({ title: 'First?' });
    const second = svc.ask({ title: 'Second?' });
    expect(await first).toBeFalse();
    svc.close(true);
    expect(await second).toBeTrue();
  });

  it('the app never uses the browser confirm box (some browsers block it)', () => {
    const native = spyOn(window, 'confirm');
    svc.ask({ title: 'x' });
    svc.close(true);
    expect(native).not.toHaveBeenCalled();
  });
});
