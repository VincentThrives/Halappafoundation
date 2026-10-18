import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { ConfirmService } from '../core/confirm.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { SmsTemplate } from '../core/models';
import { smsVariables } from './new-campaign.component';

/**
 * Settings → SMS templates: each DLT-approved SMS saved once (name, MSG91 template ID, text with ##variables##),
 * then picked from a list on the bulk SMS form. New templates need no server change.
 */
@Component({
  selector: 'app-sms-templates',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './sms-templates.component.html',
  styleUrls: ['./admin.scss', './sms-templates.component.scss'],
})
export class SmsTemplatesComponent {
  private api = inject(AdminApi);
  private confirmer = inject(ConfirmService);

  readonly items = signal<SmsTemplate[]>([]);
  /** null = form closed, 0 = adding, id = editing. */
  readonly editing = signal<number | null>(null);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly msgOk = signal(false);
  name = '';
  templateId = '';
  text = '';

  constructor() { this.load(); }

  load() { this.api.smsTemplates().subscribe(t => this.items.set(t)); }

  vars(text: string) { return smsVariables(text); }

  add() { this.open(0, '', '', ''); }
  edit(t: SmsTemplate) { this.open(t.id, t.name, t.templateId, t.text); }
  private open(id: number, name: string, templateId: string, text: string) {
    this.editing.set(id);
    this.name = name;
    this.templateId = templateId;
    this.text = text;
    this.msg.set('');
  }
  close() { this.editing.set(null); }

  /** Pasted DLT text ({#var#}) instead of MSG91's (##var##): the most common mistake. */
  dltForm(): boolean { return this.text.includes('{#'); }

  save() {
    if (!this.name.trim()) { this.note('Give the template a name, e.g. "General invitation".', false); return; }
    if (!this.templateId.trim()) { this.note('Enter the MSG91 template ID (MSG91 → SMS → Templates).', false); return; }
    if (!this.text.trim()) { this.note('Paste the approved SMS text exactly as in MSG91.', false); return; }
    if (this.dltForm()) { this.note("Use MSG91's ##variable## form, not DLT's {#var#} (e.g. ##event##, ##date##).", false); return; }
    this.busy.set(true);
    const id = this.editing() || null;
    this.api.saveSmsTemplate(id, { name: this.name, templateId: this.templateId, text: this.text }).subscribe({
      next: t => { this.busy.set(false); this.close(); this.load(); this.note(`Saved "${t.name}". It's in the SMS template list on Bulk messages.`, true); },
      error: e => { this.busy.set(false); this.note(errMsg(e), false); },
    });
  }

  async remove(t: SmsTemplate) {
    const ok = await this.confirmer.ask({
      title: `Delete "${t.name}"?`, icon: 'close', danger: true, confirmText: 'Delete',
      message: 'It disappears from the bulk SMS list. The template in MSG91 and on DLT is not touched.',
    });
    if (!ok) return;
    this.api.deleteSmsTemplate(t.id).subscribe({ next: () => { this.load(); this.note(`Deleted "${t.name}".`, true); }, error: e => this.note(errMsg(e), false) });
  }

  private note(text: string, ok: boolean) { this.msg.set(text); this.msgOk.set(ok); }
}
