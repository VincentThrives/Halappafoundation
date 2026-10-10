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
  templateUrl: './inbox.component.html',
  styleUrls: ['./admin.scss', './inbox.component.scss'],
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
