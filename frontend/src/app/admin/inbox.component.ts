import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { InboxThread, Message } from '../core/models';

const LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS', web: 'Website' };
const ICON: Record<string, string> = { whatsapp: 'whatsapp', email: 'mail', sms: 'phone', web: 'globe' };

/** Everything received and sent: conversations per person, plus a searchable log of every message. */
@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>Inbox</h1><p>Messages received and sent on WhatsApp, email, SMS and the website.</p></div>
      <div class="seg">
        <button [class.on]="tab() === 'conv'" (click)="tab.set('conv')">Conversations</button>
        <button [class.on]="tab() === 'log'" (click)="tab.set('log'); loadLog(0)">All messages</button>
      </div>
    </div>

    <div class="chips">
      @for (c of channelFilters; track c.key) {
        <button class="pill" [class.on]="channel === c.key" (click)="channel = c.key; reload()">
          @if (c.key) { <app-icon [name]="icon(c.key)" /> } {{ c.label }}
        </button>
      }
    </div>

    <!-- ===== Conversations ===== -->
    @if (tab() === 'conv') {
      <div class="inbox" [class.has-thread]="!!open()">
        <aside class="list card">
          <div class="filters">
            <input class="input grow" placeholder="Search name, number, text, voucher…" [(ngModel)]="q" (keyup.enter)="loadThreads()">
          </div>
          <label class="opt small"><input type="checkbox" [(ngModel)]="includeSent" (change)="loadThreads()"> Include people we only sent to</label>
          @for (t of threads(); track t.channel + t.contact) {
            <button class="thr" [class.on]="isOpen(t)" [class.unread]="t.unread > 0" (click)="openThread(t)">
              <span class="av" [class]="'av ' + t.channel"><app-icon [name]="icon(t.channel)" /></span>
              <span class="meta">
                <b>{{ t.name || t.contact }}</b>
                <small class="snip">{{ t.lastDirection === 'out' ? 'You: ' : '' }}{{ t.lastBody }}</small>
              </span>
              <span class="side">
                <small>{{ t.lastAt | date: 'dd MMM, h:mm a' }}</small>
                @if (t.unread) { <i class="badge">{{ t.unread }}</i> }
              </span>
            </button>
          } @empty { <p class="muted pad">No conversations yet.</p> }
          @if (threadsTotal() > threads().length) { <button class="btn-ghost more" (click)="moreThreads()">Load more</button> }
        </aside>

        <section class="thread card">
          @if (open(); as o) {
            <header>
              <button class="btn-ghost back" (click)="open.set(null)">←</button>
              <span class="av" [class]="'av ' + o.channel"><app-icon [name]="icon(o.channel)" /></span>
              <div><b>{{ o.name || o.contact }}</b><small>{{ label(o.channel) }} · {{ o.contact }}</small></div>
            </header>
            <div class="msgs" #box>
              @for (m of messages(); track m.id) {
                <div class="msg" [class.out]="m.direction === 'out'">
                  @if (m.subject && o.channel === 'email') { <b class="subj">{{ m.subject }}</b> }
                  <div class="text">{{ m.body }}</div>
                  <div class="foot">
                    @if (m.voucher) { <span class="vch">🎟 {{ m.voucher }}</span> }
                    <span>{{ m.createdAt | date: 'dd MMM, h:mm a' }}</span>
                    @if (m.direction === 'out') { <span class="tick" [title]="m.error || m.status">{{ tick(m.status) }}</span> }
                  </div>
                  @if (m.error) { <small class="red">{{ m.error }}</small> }
                </div>
              }
            </div>
            @if (o.channel === 'sms') {
              <p class="muted pad">SMS replies need a DLT-approved template — send them as a bulk SMS instead.</p>
            } @else {
              <div class="compose">
                @if (o.channel === 'email') { <input class="input" [(ngModel)]="replySubject" placeholder="Subject"> }
                <textarea class="input" rows="2" [(ngModel)]="replyText" placeholder="Type a reply…" (keydown.control.enter)="send()"></textarea>
                <button class="btn btn-maroon btn-sm" (click)="send()" [disabled]="sending()"><app-icon name="send" /> Send</button>
              </div>
              @if (replyError()) { <p class="err">{{ replyError() }}</p> }
            }
          } @else {
            <div class="empty-thread"><app-icon name="inbox" /><p>Choose a conversation</p></div>
          }
        </section>
      </div>
    }

    <!-- ===== Flat log ===== -->
    @if (tab() === 'log') {
      <div class="card">
        <div class="filters" style="margin-bottom: 12px">
          <input class="input grow" placeholder="Search name, number, text, voucher…" [(ngModel)]="q" (keyup.enter)="loadLog(0)">
          <select class="input" [(ngModel)]="direction" (change)="loadLog(0)">
            <option value="">Received + sent</option><option value="in">Received</option><option value="out">Sent</option>
          </select>
          <select class="input" [(ngModel)]="status" (change)="loadLog(0)">
            <option value="">Any status</option><option value="received">Received</option><option value="sent">Sent</option>
            <option value="delivered">Delivered</option><option value="read">Read</option><option value="failed">Failed</option><option value="manual">Manual</option>
          </select>
          <input class="input" type="date" [(ngModel)]="from" (change)="loadLog(0)" title="From">
          <input class="input" type="date" [(ngModel)]="to" (change)="loadLog(0)" title="To">
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>When</th><th></th><th>Channel</th><th>Name</th><th>Number / email</th><th>Message</th><th>Voucher</th><th>Status</th></tr></thead>
            <tbody>
              @for (m of log(); track m.id) {
                <tr class="row">
                  <td class="nowrap">{{ m.createdAt | date: 'dd MMM yy, h:mm a' }}</td>
                  <td><span class="dir" [class.in]="m.direction === 'in'">{{ m.direction === 'in' ? '↓ In' : '↑ Out' }}</span></td>
                  <td>{{ label(m.channel) }}</td>
                  <td>{{ m.name }}</td>
                  <td class="nowrap">{{ m.contact }}</td>
                  <td class="msgcell">@if (m.subject) {<b>{{ m.subject }}</b><br>}{{ m.body }}</td>
                  <td class="mono">{{ m.voucher }}</td>
                  <td>{{ m.status }}@if (m.error) {<br><small class="red">{{ m.error }}</small>}</td>
                </tr>
              } @empty { <tr><td colspan="8" class="muted">No messages.</td></tr> }
            </tbody>
          </table>
        </div>
        <div class="pager">
          <span class="muted">{{ logTotal() }} messages</span>
          <div class="actions">
            <button class="btn-ghost" [disabled]="logPage === 0" (click)="loadLog(logPage - 1)">‹ Prev</button>
            <button class="btn-ghost" [disabled]="(logPage + 1) * 50 >= logTotal()" (click)="loadLog(logPage + 1)">Next ›</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .seg { display: inline-flex; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 4px; }
    .seg button { border: 0; background: none; padding: 8px 16px; border-radius: 9px; cursor: pointer; font-weight: 600; color: var(--m-800); }
    .seg button.on { background: var(--maroon-grad); color: var(--g-300); }
    .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .pill { border: 1.5px solid var(--line); background: #fff; border-radius: 999px; padding: 6px 14px; cursor: pointer; font-weight: 500; color: var(--m-800); display: inline-flex; gap: 6px; align-items: center; }
    .pill app-icon { width: 16px; height: 16px; }
    .pill.on { background: var(--maroon-grad); color: var(--g-300); border-color: transparent; }
    .inbox { display: grid; grid-template-columns: 360px 1fr; gap: 16px; height: calc(100vh - 240px); min-height: 480px; }
    .list { overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
    .opt.small { font-size: .82rem; color: var(--muted); display: flex; gap: 6px; align-items: center; margin: 6px 4px 8px; }
    .thr { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 10px; border: 0; background: none; border-radius: 12px; cursor: pointer; text-align: left; width: 100%; }
    .thr:hover { background: var(--cream); }
    .thr.on { background: var(--cream-2); }
    .thr.unread b { color: var(--m-700); }
    .meta { min-width: 0; display: grid; }
    .snip { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .side { display: grid; justify-items: end; gap: 4px; }
    .side small { color: var(--muted); font-size: .72rem; white-space: nowrap; }
    .badge { font-style: normal; background: #1fb855; color: #fff; border-radius: 999px; font-size: .72rem; padding: 1px 7px; font-weight: 700; }
    .av { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--m-700); flex: none; }
    .av app-icon { width: 20px; height: 20px; }
    .av.whatsapp { background: #1fb855; } .av.email { background: #5b3cc4; } .av.sms { background: #0b72c4; } .av.web { background: var(--g-600); }
    .thread { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
    .thread header { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--cream); }
    .thread header small { display: block; color: var(--muted); }
    .back { display: none; }
    .msgs { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 10px; background: #efeae2; }
    .msg { max-width: 72%; align-self: flex-start; background: #fff; border-radius: 12px 12px 12px 2px; padding: 8px 12px; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
    .msg.out { align-self: flex-end; background: #d9fdd3; border-radius: 12px 12px 2px 12px; }
    .text { white-space: pre-wrap; word-break: break-word; }
    .subj { display: block; margin-bottom: 4px; }
    .foot { display: flex; gap: 8px; justify-content: flex-end; font-size: .72rem; color: var(--muted); margin-top: 4px; align-items: center; }
    .vch { background: var(--g-300); color: var(--m-900); border-radius: 6px; padding: 0 6px; font-family: monospace; }
    .tick { color: #34b7f1; font-weight: 700; }
    .compose { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 12px; border-top: 1px solid var(--line); align-items: end; }
    .compose input { grid-column: 1 / -1; }
    .empty-thread { flex: 1; display: grid; place-content: center; justify-items: center; color: var(--muted); }
    .empty-thread app-icon { width: 60px; height: 60px; color: var(--line); }
    .pad { padding: 12px 16px; }
    .more { margin: 8px auto; }
    .red { color: #b3261e; }
    .err { color: var(--m-500); margin: 0 12px 12px; }
    .dir { font-weight: 700; color: var(--m-600); font-size: .8rem; white-space: nowrap; }
    .dir.in { color: #0e7a3c; }
    .msgcell { max-width: 380px; white-space: pre-wrap; font-size: .88rem; }
    .mono { font-family: monospace; }
    .nowrap { white-space: nowrap; }
    @media (max-width: 900px) {
      .inbox { grid-template-columns: 1fr; height: auto; }
      .inbox.has-thread .list { display: none; }
      .inbox:not(.has-thread) .thread { display: none; }
      .thread { height: calc(100vh - 200px); }
      .back { display: inline-flex; }
      .msg { max-width: 88%; }
    }
  `],
})
export class InboxComponent implements OnDestroy {
  private api = inject(AdminApi);

  readonly channelFilters = [
    { key: '', label: 'All' }, { key: 'whatsapp', label: 'WhatsApp' }, { key: 'email', label: 'Email' },
    { key: 'sms', label: 'SMS' }, { key: 'web', label: 'Website' },
  ];
  readonly tab = signal<'conv' | 'log'>('conv');
  channel = '';
  q = '';
  includeSent = false;
  readonly threads = signal<InboxThread[]>([]);
  readonly threadsTotal = signal(0);
  private threadPage = 0;
  readonly open = signal<InboxThread | null>(null);
  readonly messages = signal<Message[]>([]);
  replyText = '';
  replySubject = '';
  readonly sending = signal(false);
  readonly replyError = signal('');

  direction = '';
  status = '';
  from = '';
  to = '';
  logPage = 0;
  readonly log = signal<Message[]>([]);
  readonly logTotal = signal(0);
  private timer?: ReturnType<typeof setInterval>;

  constructor() {
    this.loadThreads();
    // New messages arrive through webhooks / the mailbox check; refresh quietly.
    this.timer = setInterval(() => {
      if (this.tab() !== 'conv') return;
      this.loadThreads(true);
      const o = this.open();
      if (o) this.api.thread(o.channel, o.contact).subscribe(m => this.messages.set(m));
    }, 15000);
  }

  ngOnDestroy() { clearInterval(this.timer); }

  label(c: string) { return LABEL[c] ?? c; }
  icon(c: string) { return ICON[c] ?? 'inbox'; }
  tick(s: string) { return ({ queued: '🕓', manual: '↗', sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠', cancelled: '✕' } as Record<string, string>)[s] ?? ''; }
  isOpen(t: InboxThread) { const o = this.open(); return !!o && o.channel === t.channel && o.contact === t.contact; }

  reload() { this.tab() === 'conv' ? this.loadThreads() : this.loadLog(0); }

  /** Reloads the first page of conversations (a quiet refresh keeps the open thread as is). */
  loadThreads(quiet = false) {
    if (!quiet) this.threadPage = 0;
    if (quiet && this.threadPage > 0) return; // don't collapse a list the admin has paged through
    this.api.threads(this.channel, this.q, this.includeSent, 0).subscribe(p => {
      this.threads.set(p.items);
      this.threadsTotal.set(p.total);
    });
  }

  moreThreads() {
    this.threadPage++;
    this.api.threads(this.channel, this.q, this.includeSent, this.threadPage).subscribe(p => {
      this.threads.set([...this.threads(), ...p.items]);
      this.threadsTotal.set(p.total);
    });
  }

  openThread(t: InboxThread) {
    this.open.set(t);
    this.replyError.set('');
    this.replyText = '';
    this.replySubject = t.channel === 'email' ? 'Re: Halappa Foundation' : '';
    this.api.thread(t.channel, t.contact).subscribe(m => {
      this.messages.set(m);
      const lastSubj = [...m].reverse().find(x => x.subject)?.subject;
      if (t.channel === 'email' && lastSubj) this.replySubject = lastSubj.startsWith('Re:') ? lastSubj : 'Re: ' + lastSubj;
      this.threads.set(this.threads().map(x => (x === t ? { ...x, unread: 0 } : x)));
    });
  }

  send() {
    const o = this.open();
    if (!o || !this.replyText.trim()) return;
    this.sending.set(true);
    this.replyError.set('');
    this.api.reply({ channel: o.channel, contact: o.contact, subject: this.replySubject, text: this.replyText }).subscribe({
      next: r => {
        this.sending.set(false);
        this.messages.set([...this.messages(), r.message]);
        this.replyText = '';
        if (r.link) window.open(r.link, '_blank', 'noopener'); // manual WhatsApp
      },
      error: e => { this.sending.set(false); this.replyError.set(errMsg(e)); },
    });
  }

  loadLog(p: number) {
    this.logPage = p;
    this.api.messageLog({ channel: this.channel, direction: this.direction, status: this.status, q: this.q, from: this.from, to: this.to }, p)
      .subscribe(r => { this.log.set(r.items); this.logTotal.set(r.total); });
  }
}
