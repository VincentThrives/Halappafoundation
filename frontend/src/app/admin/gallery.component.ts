import { Component, inject, signal } from '@angular/core';
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
  imports: [FormsModule, IconComponent],
  styleUrl: './admin.scss',
  template: `
    <div class="head"><div><h1>Gallery</h1><p>Upload photos into the five gallery albums.</p></div></div>

    <div class="card stack">
      <h2>Upload photos</h2>
      <div class="grid3">
        <div class="field"><label>Album</label>
          <select class="input" [(ngModel)]="category">@for (c of cats; track c) { <option [value]="c">{{ c }}</option> }</select></div>
        <div class="field"><label>Caption <span class="lang-tag">EN</span></label><input class="input" [(ngModel)]="captionEn"></div>
        <div class="field"><label>Caption <span class="lang-tag">ಕನ್ನಡ</span></label><input class="input" [(ngModel)]="captionKn"></div>
      </div>
      <label class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)">
        <input type="file" accept="image/*" multiple (change)="pick($event)">
        <app-icon name="image" />
        <span>{{ files().length ? files().length + ' photo(s) ready' : 'Click or drop photos here (up to 10 MB each)' }}</span>
      </label>
      @if (error()) { <p class="err">{{ error() }}</p> }
      <div><button class="btn btn-maroon" (click)="upload()" [disabled]="!files().length || busy()">{{ busy() ? 'Uploading…' : 'Upload' }}</button></div>
    </div>

    <div class="card">
      <div class="filters" style="margin-bottom: 14px">
        <select class="input" [(ngModel)]="filter" (change)="load()">
          <option value="">All albums</option>@for (c of cats; track c) { <option [value]="c">{{ c }}</option> }
        </select>
        <span class="muted">{{ items().length }} photos</span>
      </div>
      <div class="grid">
        @for (g of items(); track g.id) {
          <div class="ph">
            <img [src]="g.image" alt="" loading="lazy">
            <div class="meta">
              <select class="input sm" [(ngModel)]="g.category">@for (c of cats; track c) { <option [value]="c">{{ c }}</option> }</select>
              <input class="input sm" [(ngModel)]="g.captionEn" placeholder="Caption (EN)">
              <input class="input sm" [(ngModel)]="g.captionKn" placeholder="ಶೀರ್ಷಿಕೆ (KN)">
              <div class="actions">
                <button class="btn-ghost" (click)="save(g)">Save</button>
                <button class="icon-btn danger" (click)="remove(g)" title="Delete"><app-icon name="trash" /></button>
              </div>
            </div>
          </div>
        } @empty { <p class="muted">No photos yet.</p> }
      </div>
    </div>
    @if (toast()) { <div class="toast" [class.err]="toastErr">{{ toast() }}</div> }
  `,
  styles: [`
    .drop { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px; border: 2px dashed var(--line); border-radius: 14px; cursor: pointer; color: var(--muted); transition: all .2s; }
    .drop.over, .drop:hover { border-color: var(--g-500); background: var(--cream); }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop app-icon { width: 40px; height: 40px; color: var(--g-600); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .ph { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: #fff; }
    .ph img { width: 100%; height: 160px; object-fit: cover; }
    .meta { padding: 10px; display: grid; gap: 6px; }
    .sm { padding: 7px 10px; font-size: .85rem; }
    .err { color: var(--m-500); margin: 0; }
  `],
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
