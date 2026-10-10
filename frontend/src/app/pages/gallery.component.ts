import { Component, HostListener, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { RevealDirective } from '../core/motion';
import { GalleryItem } from '../core/models';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [MediaPipe, RouterLink, RouterLinkActive, TPipe, LocPipe, IconComponent, RevealDirective],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss',
})
export class GalleryComponent {
  private api = inject(ApiService);
  readonly cats = MENU.gallery;
  readonly category = signal('');
  readonly items = signal<GalleryItem[] | null>(null);
  readonly lightbox = signal<number | null>(null);

  constructor() {
    inject(ActivatedRoute).paramMap.subscribe(p => {
      this.category.set(p.get('category') ?? '');
      this.items.set(null);
      this.api.gallery(this.category() || undefined).subscribe({ next: g => this.items.set(g), error: () => this.items.set([]) });
    });
  }

  open(i: number) { this.lightbox.set(i); document.body.style.overflow = 'hidden'; }
  close() { this.lightbox.set(null); document.body.style.overflow = ''; }
  step(d: number, e?: Event) {
    e?.stopPropagation();
    const n = this.items()?.length ?? 0;
    if (n && this.lightbox() !== null) this.lightbox.set((this.lightbox()! + d + n) % n);
  }

  @HostListener('document:keydown', ['$event'])
  key(e: KeyboardEvent) {
    if (this.lightbox() === null) return;
    if (e.key === 'Escape') this.close();
    if (e.key === 'ArrowRight') this.step(1);
    if (e.key === 'ArrowLeft') this.step(-1);
  }
}
