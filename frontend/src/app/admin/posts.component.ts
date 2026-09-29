import { Component, HostListener, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { Post } from '../core/models';

const SECTIONS: Record<string, { label: string; cats: string[] }> = {
  press: { label: 'Press', cats: ['news', 'interviews', 'editorials', 'critic', 'press-releases'] },
  views: { label: 'My Views', cats: ['quotes', 'blogs', 'articles'] },
  stalwart: { label: 'Stalwart Says', cats: ['stalwart'] },
};

interface PostForm {
  id: number | null; section: string; category: string; titleEn: string; titleKn: string; bodyEn: string; bodyKn: string;
  author: string; sourceUrl: string; publishedOn: string; image?: string; removeImage: boolean;
}

@Component({
  selector: 'app-admin-posts',
  standalone: true,
  imports: [FormsModule, DatePipe, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head">
      <div><h1>Press, My Views &amp; Stalwart Says</h1><p>Everything here appears on the public site in English and Kannada.</p></div>
      <button class="btn btn-maroon btn-sm" (click)="edit()"><app-icon name="plus" /> New post</button>
    </div>

    <div class="card">
      <div class="filters">
        <select class="input" [(ngModel)]="fSection" (change)="fCategory = ''; load(0)">
          <option value="">All sections</option>
          @for (s of sectionKeys; track s) { <option [value]="s">{{ sections[s].label }}</option> }
        </select>
        @if (fSection) {
          <select class="input" [(ngModel)]="fCategory" (change)="load(0)">
            <option value="">All categories</option>
            @for (c of sections[fSection].cats; track c) { <option [value]="c">{{ c }}</option> }
          </select>
        }
      </div>
    </div>

    <div class="card">
      <div class="tbl-wrap">
        <table>
          <thead><tr><th></th><th>Title</th><th>Section</th><th>Date</th><th></th></tr></thead>
          <tbody>
            @for (p of rows(); track p.id) {
              <tr class="row">
                <td style="width:64px">@if (p.image) { <img [src]="p.image" class="thumb" alt=""> }</td>
                <td><b>{{ p.titleEn }}</b>@if (p.titleKn) {<br><span class="muted">{{ p.titleKn }}</span>}</td>
                <td><span class="chip manual">{{ sections[p.section].label }} · {{ p.category }}</span></td>
                <td class="nowrap">{{ p.publishedOn | date: 'dd MMM yyyy' }}</td>
                <td class="nowrap">
                  <button class="icon-btn" (click)="edit(p)" title="Edit"><app-icon name="edit" /></button>
                  <button class="icon-btn danger" (click)="remove(p)" title="Delete"><app-icon name="trash" /></button>
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="muted" style="text-align:center; padding: 30px">No posts yet.</td></tr> }
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span class="muted">{{ total() }} posts</span>
        <div class="actions">
          <button class="btn-ghost" [disabled]="page === 0" (click)="load(page - 1)">‹ Prev</button>
          <button class="btn-ghost" [disabled]="(page + 1) * 20 >= total()" (click)="load(page + 1)">Next ›</button>
        </div>
      </div>
    </div>

    @if (form(); as f) {
      <!-- Clicking outside does NOT close: it used to throw away edits by accident. -->
      <div class="modal-bg">
        <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="f.id ? 'Edit post' : 'New post'">
          <div class="modal-head">
            <h2>{{ f.id ? 'Edit post' : 'New post' }}</h2>
            <button class="modal-x" (click)="form.set(null)" aria-label="Close"><app-icon name="close" /></button>
          </div>
          <div class="modal-body stack">
            <div class="grid3">
              <div class="field"><label>Section</label>
                <select class="input" [(ngModel)]="f.section" (change)="f.category = sections[f.section].cats[0]">
                  @for (s of sectionKeys; track s) { <option [value]="s">{{ sections[s].label }}</option> }
                </select></div>
              <div class="field"><label>Category</label>
                <select class="input" [(ngModel)]="f.category">
                  @for (c of sections[f.section].cats; track c) { <option [value]="c">{{ c }}</option> }
                </select></div>
              <div class="field"><label>Date</label><input class="input" type="date" [(ngModel)]="f.publishedOn"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>Title <span class="lang-tag">EN</span> *</label><input class="input" [(ngModel)]="f.titleEn"></div>
              <div class="field"><label>Title <span class="lang-tag">ಕನ್ನಡ</span></label><input class="input" [(ngModel)]="f.titleKn"></div>
            </div>
            <div class="grid2">
              <div class="field"><label>{{ f.section === 'stalwart' || f.category === 'quotes' ? 'Quote' : 'Body' }} <span class="lang-tag">EN</span></label>
                <textarea class="input" rows="9" [(ngModel)]="f.bodyEn" placeholder="Leave a blank line between paragraphs"></textarea></div>
              <div class="field"><label>{{ f.section === 'stalwart' || f.category === 'quotes' ? 'Quote' : 'Body' }} <span class="lang-tag">ಕನ್ನಡ</span></label>
                <textarea class="input" rows="9" [(ngModel)]="f.bodyKn"></textarea></div>
            </div>
            <div class="grid2">
              <div class="field"><label>{{ f.section === 'stalwart' ? 'Who said it (name)' : 'Author / publication' }}</label><input class="input" [(ngModel)]="f.author"></div>
              <div class="field"><label>Source link (optional)</label><input class="input" [(ngModel)]="f.sourceUrl" placeholder="https://…"></div>
            </div>
            <div class="field">
              <label>{{ f.section === 'stalwart' ? 'Photo of the person' : 'Cover image' }}</label>
              <div class="img-row">
                @if (preview() || (f.image && !f.removeImage)) { <img [src]="preview() || f.image" class="prev" alt=""> }
                <input type="file" accept="image/*" (change)="pick($event)">
                @if (f.image && !preview()) { <label class="opt"><input type="checkbox" [(ngModel)]="f.removeImage"> Remove image</label> }
              </div>
            </div>
          </div>
          <div class="modal-foot">
            @if (error()) { <p class="err">{{ error() }}</p> }
            <button class="btn-ghost" (click)="form.set(null)">Cancel</button>
            <button class="btn btn-maroon" (click)="save(f)" [disabled]="busy()"><app-icon name="check" /> {{ busy() ? 'Saving…' : (f.id ? 'Save changes' : 'Publish') }}</button>
          </div>
        </div>
      </div>
    }
    @if (toast()) { <div class="toast" [class.err]="toastErr">{{ toast() }}</div> }
  `,
  styles: [`
    .thumb { width: 56px; height: 40px; object-fit: cover; border-radius: 6px; }
    .nowrap { white-space: nowrap; }
    .img-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .prev { width: 120px; height: 80px; object-fit: cover; border-radius: 10px; }
    .opt { display: flex; gap: 6px; align-items: center; font-weight: 400; }
    .err { color: var(--m-500); margin: 0; }
  `],
})
export class AdminPostsComponent {
  private api = inject(AdminApi);
  private confirm = inject(ConfirmService);
  readonly sections = SECTIONS;
  readonly sectionKeys = Object.keys(SECTIONS);
  fSection = '';
  fCategory = '';
  page = 0;
  readonly rows = signal<Post[]>([]);
  readonly total = signal(0);
  readonly form = signal<PostForm | null>(null);
  readonly preview = signal<string>('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  private file: File | null = null;

  constructor() { this.load(0); }

  load(p: number) {
    this.page = p;
    this.api.posts(this.fSection, this.fCategory, p).subscribe(r => { this.rows.set(r.items); this.total.set(r.total); });
  }

  edit(p?: Post) {
    this.file = null;
    this.preview.set('');
    this.error.set('');
    const section = p?.section ?? (this.fSection || 'press');
    this.form.set({
      id: p?.id ?? null, section, category: p?.category ?? (this.fCategory || SECTIONS[section].cats[0]),
      titleEn: p?.titleEn ?? '', titleKn: p?.titleKn ?? '', bodyEn: p?.bodyEn ?? '', bodyKn: p?.bodyKn ?? '',
      author: p?.author ?? '', sourceUrl: p?.sourceUrl ?? '', publishedOn: p?.publishedOn ?? new Date().toISOString().slice(0, 10),
      image: p?.image, removeImage: false,
    });
  }

  pick(e: Event) {
    this.file = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (this.preview()) URL.revokeObjectURL(this.preview());
    this.preview.set(this.file ? URL.createObjectURL(this.file) : '');
  }

  save(f: PostForm) {
    if (!f.titleEn.trim()) { this.error.set('English title is required'); return; }
    const fd = new FormData();
    for (const k of ['section', 'category', 'titleEn', 'titleKn', 'bodyEn', 'bodyKn', 'author', 'sourceUrl', 'publishedOn'] as const) fd.append(k, f[k] ?? '');
    fd.append('removeImage', String(f.removeImage));
    if (this.file) fd.append('image', this.file);
    this.busy.set(true);
    this.api.savePost(f.id, fd).subscribe({
      next: () => { this.busy.set(false); this.form.set(null); this.say(f.id ? 'Changes saved' : 'Post published'); this.load(this.page); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }

  @HostListener('document:keydown.escape')
  esc() { if (!this.busy()) this.form.set(null); }

  async remove(p: Post) {
    const ok = await this.confirm.ask({
      title: 'Delete this post?', detail: p.titleEn, danger: true,
      message: 'It will be removed from the website in English and Kannada. This cannot be undone.',
    });
    if (!ok) return;
    this.api.deletePost(p.id).subscribe({
      next: () => { this.say('Post deleted'); this.load(this.page); },
      error: e => this.say(errMsg(e, 'Could not delete'), true),
    });
  }

  toastErr = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  /** Shows a message; a newer message restarts the timer instead of being cut short by the older one. */
  private say(m: string, err = false) {
    this.toastErr = err;
    this.toast.set(m);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2600);
  }
}
