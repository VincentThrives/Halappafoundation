import { Component, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { LangService, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { DISTRICTS, ENQUIRY_TYPES } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { RevealDirective } from '../core/motion';
import { errMsg } from '../core/auth.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, AsyncPipe, RouterLink, TPipe, IconComponent, RevealDirective],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent {
  readonly lang = inject(LangService);
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private sanitizer = inject(DomSanitizer);

  readonly settings$ = this.api.settings();
  readonly mapUrl$ = this.settings$.pipe(map(s => s['mapQuery']
    ? this.sanitizer.bypassSecurityTrustResourceUrl('https://www.google.com/maps?q=' + encodeURIComponent(s['mapQuery']) + '&output=embed')
    : null as SafeResourceUrl | null));
  readonly districts = DISTRICTS;
  readonly types = ENQUIRY_TYPES;
  readonly busy = signal<'' | 'email' | 'whatsapp'>('');
  readonly error = signal('');
  readonly done = signal<{ id: number; whatsappUrl?: string } | null>(null);
  private tried = false;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    phone: ['', [Validators.required, Validators.pattern(/^(\+?91[\s-]?)?0?[6-9]\d{9}$/)]],
    email: ['', [Validators.email]],
    type: ['query'],
    district: [''],
    taluk: [''],
    subject: [''],
    message: ['', [Validators.required, Validators.maxLength(4000)]],
    website: [''],
  });

  bad(name: string) {
    const c = this.form.get(name)!;
    return c.invalid && (c.touched || this.tried);
  }

  submit(channel: 'email' | 'whatsapp') {
    this.tried = true;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    // Open the WhatsApp tab synchronously so pop-up blockers allow it; point it at the chat once saved.
    const waTab = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    this.busy.set(channel);
    this.api.enquire({ ...this.form.getRawValue(), channel, lang: this.lang.lang() }).subscribe({
      next: r => {
        this.busy.set('');
        this.done.set(r);
        if (r.whatsappUrl) {
          if (waTab) waTab.location.href = r.whatsappUrl;
          else window.open(r.whatsappUrl, '_blank');
        }
        scrollTo({ top: 300, behavior: 'smooth' });
      },
      error: e => {
        waTab?.close();
        this.busy.set('');
        this.error.set(errMsg(e, this.lang.t('send.fail')));
      },
    });
  }

  reset() {
    this.tried = false;
    this.form.reset({ type: 'query' });
    this.done.set(null);
  }
}
