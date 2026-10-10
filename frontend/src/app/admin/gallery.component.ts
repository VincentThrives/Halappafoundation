import { Component, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
import { FormsModule } from '@angular/forms';
import { AdminApi } from './admin-api.service';
import { IconComponent } from '../core/icon.component';
import { errMsg } from '../core/auth.service';
import { ConfirmService } from '../core/confirm.service';
import { MENU } from '../core/i18n';
import { GalleryItem } from '../core/models';

@Component({
  selector: 'app-admin-gallery',
  standalone: true,
  imports: [MediaPipe, FormsModule, IconComponent],
  templateUrl: './gallery.component.html',
  styleUrls: ['./admin.scss', './gallery.component.scss'],
})
export class AdminGalleryComponent {
  private api = inject(AdminApi);
  private confirm = inject(ConfirmService);
  readonly cats = MENU.gallery;
  category = MENU.gallery[0];
  captionEn = '';
  captionKn = '';
  filter = '';
  readonly files = signal<File[]>([]);
  readonly items = signal<GalleryItem[]>([]);
  readonly over = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly toast = signal('');

  constructor() { this.load(); }

  load() { this.api.gallery(this.filter || undefined).subscribe(g => this.items.set(g)); }

  pick(e: Event) { this.files.set(Array.from((e.target as HTMLInputElement).files ?? [])); }
  drop(e: DragEvent) {
    e.preventDefault();
    this.over.set(false);
    this.files.set(Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/')));
  }

  upload() {
    const fd = new FormData();
    fd.append('category', this.category);
    fd.append('captionEn', this.captionEn);
    fd.append('captionKn', this.captionKn);
    this.files().forEach(f => fd.append('images', f));
    this.busy.set(true);
    this.error.set('');
    this.api.uploadPhotos(fd).subscribe({
      next: r => { this.busy.set(false); this.files.set([]); this.captionEn = this.captionKn = ''; this.say(`${r.length} uploaded`); this.load(); },
      error: e => { this.busy.set(false); this.error.set(errMsg(e, 'Upload failed')); },
    });
  }

  save(g: GalleryItem) {
    this.api.updatePhoto(g.id, { category: g.category, captionEn: g.captionEn, captionKn: g.captionKn }).subscribe({
      next: () => { this.say('Photo details saved'); if (this.filter && this.filter !== g.category) this.load(); },
      error: e => this.say(errMsg(e, 'Could not save'), true),
    });
  }

  async remove(g: GalleryItem) {
    const ok = await this.confirm.ask({
      title: 'Delete this photo?', detail: g.captionEn || undefined, danger: true,
      message: 'It will be removed from the website gallery. This cannot be undone.',
    });
    if (!ok) return;
    this.api.deletePhoto(g.id).subscribe({
      next: () => { this.say('Photo deleted'); this.load(); },
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
