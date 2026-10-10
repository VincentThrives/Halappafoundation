import { Component, HostListener, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
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
  imports: [MediaPipe, FormsModule, DatePipe, IconComponent],
  templateUrl: './posts.component.html',
  styleUrls: ['./admin.scss', './posts.component.scss'],
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
