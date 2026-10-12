import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AdminApi } from './admin-api.service';
import { ConfirmService } from '../core/confirm.service';
import { WalletComponent } from './wallet.component';
import { SuperAdminComponent } from './super-admin.component';
import { WalletLogComponent } from './wallet-log.component';
import { WalletTxn, rupees } from '../core/models';

function txn(over: Partial<WalletTxn> = {}): WalletTxn {
  return { id: 1, admin: 'admin', type: 'RECHARGE', amountPaise: 50000, balanceAfterPaise: 50000, messages: 0, ratePaise: 0,
    note: 'UPI 123', by: 'owner', at: '2026-10-12T10:00:00', ...over };
}

function stub() {
  return {
    wallet: jasmine.createSpy('wallet').and.returnValue(of({ username: 'admin', superAdmin: false, balancePaise: 68000,
      rates: { whatsappPaise: 80, smsPaise: 25, emailPaise: 10 } })),
    walletLog: jasmine.createSpy('walletLog').and.returnValue(of({ items: [
      txn({ id: 3, type: 'REFUND', amountPaise: 80, balanceAfterPaise: 68000, channel: 'whatsapp', campaignId: 7, campaignName: 'Kit invite', messages: 1, ratePaise: 80, note: 'Not sent (failed or cancelled)', by: 'system' }),
      txn({ id: 2, type: 'SEND', amountPaise: -2000, balanceAfterPaise: 67920, channel: 'whatsapp', campaignId: 7, campaignName: 'Kit invite', messages: 25, ratePaise: 80, note: undefined, by: 'admin' }),
      txn({ id: 1 }),
    ], total: 3, page: 0, size: 50 })),
    superAdmins: jasmine.createSpy('superAdmins').and.returnValue(of([
      { username: 'admin', role: 'ADMIN', walletPaise: 68000 },
      { username: 'owner', role: 'SUPER_ADMIN', walletPaise: 0 },
    ])),
    superRates: jasmine.createSpy('superRates').and.returnValue(of({ whatsappPaise: 80, smsPaise: 25, emailPaise: 0, updatedBy: 'owner', updatedAt: '2026-10-12T09:00:00' })),
    setRates: jasmine.createSpy('setRates').and.returnValue(of({ whatsappPaise: 90, smsPaise: 25, emailPaise: 0 })),
    recharge: jasmine.createSpy('recharge').and.returnValue(of(txn({ amountPaise: 50000, balanceAfterPaise: 118000 }))),
    deduct: jasmine.createSpy('deduct').and.returnValue(of(txn({ type: 'DEDUCT', amountPaise: -500, balanceAfterPaise: 67500 }))),
    audit: jasmine.createSpy('audit').and.returnValue(of({ items: [txn(), txn({ id: 2, admin: '-', type: 'RATES', amountPaise: 0, note: 'Prices per message: WhatsApp ₹0.80' })], total: 2, page: 0, size: 50 })),
  };
}

describe('rupees()', () => {
  it('formats paise as Indian rupees', () => {
    expect(rupees(0)).toBe('₹0.00');
    expect(rupees(80)).toBe('₹0.80');
    expect(rupees(12345)).toBe('₹123.45');
    expect(rupees(12345678)).toBe('₹1,23,456.78');
    expect(rupees(-2000)).toBe('-₹20.00');
    expect(rupees(null)).toBe('₹0.00');
  });
});

describe('Wallet audit log table', () => {
  it('shows type, send, messages × price, signed amount and balance after', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(WalletLogComponent);
    f.componentRef.setInput('items', [
      txn({ id: 2, type: 'SEND', amountPaise: -2000, balanceAfterPaise: 48000, channel: 'whatsapp', campaignId: 7, campaignName: 'Kit invite', messages: 25, ratePaise: 80, note: undefined }),
      txn({ id: 1 }),
    ]);
    f.componentRef.setInput('showAdmin', true);
    f.detectChanges();
    const rows = [...f.nativeElement.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Bulk send');
    expect(rows[0].textContent).toContain('WhatsApp');
    expect(rows[0].textContent).toContain('25 messages × ₹0.80');
    expect(rows[0].querySelector('.minus')!.textContent!.trim()).toBe('-₹20.00');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/admin/messages/7');
    expect(rows[1].querySelector('.plus')!.textContent!.trim()).toBe('+₹500.00');
    expect(rows[1].textContent).toContain('UPI 123');
    expect(f.nativeElement.querySelectorAll('thead th').length).toBe(7); // with the Admin column
  });

  it('says when there is nothing yet', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(WalletLogComponent);
    f.componentRef.setInput('items', []);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Nothing here yet.');
  });
});

describe('Admin: Wallet page', () => {
  it('shows the balance, the prices and the history, and filters it', () => {
    const api = stub();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminApi, useValue: api }] });
    const f = TestBed.createComponent(WalletComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.balance strong')!.textContent).toBe('₹680.00');
    expect(el.querySelector('.prices')!.textContent).toContain('₹0.80');
    expect(el.querySelectorAll('app-wallet-log tbody tr').length).toBe(3);

    f.componentInstance.f.type = 'REFUND';
    f.componentInstance.load(0);
    expect(api.walletLog).toHaveBeenCalledWith(jasmine.objectContaining({ type: 'REFUND' }), 0);
  });

  it('an empty wallet says to ask the super admin', () => {
    const api = stub();
    api.wallet.and.returnValue(of({ username: 'admin', superAdmin: false, balancePaise: 0, rates: { whatsappPaise: 80, smsPaise: 0, emailPaise: 0 } }));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminApi, useValue: api }] });
    const f = TestBed.createComponent(WalletComponent);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.balance').classList.contains('low')).toBeTrue();
    expect(f.nativeElement.textContent).toContain('Ask the super admin to recharge');
  });
});

describe('Super admin page', () => {
  function make(confirm = true) {
    const api = stub();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminApi, useValue: api }] });
    const ask = spyOn(TestBed.inject(ConfirmService), 'ask').and.resolveTo(confirm);
    const f = TestBed.createComponent(SuperAdminComponent);
    f.detectChanges();
    return { f, c: f.componentInstance, api, ask, el: f.nativeElement as HTMLElement };
  }

  it('lists admin wallets (not the super admin) with balances', () => {
    const { el } = make();
    const rows = [...el.querySelectorAll('table.wallets tbody tr')] as HTMLElement[];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('admin');
    expect(rows[0].querySelector('.num')!.textContent!.trim()).toBe('₹680.00');
  });

  it('recharge: checks the amount, confirms with the balance after, saves and refreshes', async () => {
    const { f, c, api, ask, el } = make();
    c.open('admin', 'recharge');
    f.detectChanges();
    expect(el.querySelector('.form-row')).toBeTruthy();

    c.amount = 'abc';
    await c.saveMoney();
    expect(c.toast()).toContain('Enter an amount');
    expect(ask).not.toHaveBeenCalled();

    c.amount = '500';
    c.note = 'UPI 123';
    await c.saveMoney();
    expect(ask.calls.mostRecent().args[0].title).toBe("Add ₹500.00 to admin's wallet?");
    expect(ask.calls.mostRecent().args[0].detail).toBe('Balance after: ₹1,180.00');
    expect(api.recharge).toHaveBeenCalledWith('admin', '500', 'UPI 123');
    expect(c.toast()).toBe('Recharged ₹500.00. admin now has ₹1,180.00.');
    expect(c.editing()).toBeNull();
    expect(api.superAdmins).toHaveBeenCalledTimes(2);
    expect(api.audit).toHaveBeenCalledTimes(2);
  });

  it('deduct is marked as dangerous and cancelling the popup changes nothing', async () => {
    const { c, api, ask } = make(false);
    c.open('admin', 'deduct');
    c.amount = '5';
    await c.saveMoney();
    expect(ask.calls.mostRecent().args[0].danger).toBeTrue();
    expect(api.deduct).not.toHaveBeenCalled();
  });

  it('server refusals are shown', async () => {
    const { c, api } = make();
    api.deduct.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'The wallet has only ₹680.00; can\'t deduct ₹900.00' } })));
    c.open('admin', 'deduct');
    c.amount = '900';
    await c.saveMoney();
    expect(c.toast()).toContain("can't deduct ₹900.00");
    expect(c.toastErr).toBeTrue();
    expect(c.busy()).toBeFalse();
  });

  it('prices load in rupees and save', () => {
    const { c, api } = make();
    expect(c.rates).toEqual({ whatsapp: '0.80', sms: '0.25', email: '0.00' });
    expect(c.ratesInfo()).toContain('owner');
    c.rates.whatsapp = '0.90';
    c.saveRates();
    expect(api.setRates).toHaveBeenCalledWith({ whatsapp: '0.90', sms: '0.25', email: '0.00' });
    expect(c.toast()).toContain('Prices saved');
  });

  it('audit log shows everyone and filters by admin, type and dates', () => {
    const { f, c, api, el } = make();
    expect(el.querySelectorAll('app-wallet-log tbody tr').length).toBe(2);
    expect(el.textContent).toContain('Prices changed');
    c.f = { admin: 'admin', type: 'SEND', from: '2026-10-01', to: '2026-10-12' };
    c.load(0);
    expect(api.audit).toHaveBeenCalledWith({ admin: 'admin', type: 'SEND', from: '2026-10-01', to: '2026-10-12' }, 0);
    f.detectChanges();
  });
});
