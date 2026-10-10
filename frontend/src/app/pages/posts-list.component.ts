import { Component, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { DatePipe } from '@angular/common';
import { combineLatest } from 'rxjs';
import { LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { MENU } from '../core/i18n';
import { RevealDirective } from '../core/motion';
import { IconComponent } from '../core/icon.component';
import { Post } from '../core/models';

/** One component for Press/*, My Views/* and Stalwart Says (route data picks the section). */
@Component({
  selector: 'app-posts-list',
  standalone: true,
  imports: [MediaPipe, RouterLink, RouterLinkActive, TPipe, LocPipe, DatePipe, RevealDirective, IconComponent],
  templateUrl: './posts-list.component.html',
  styleUrl: './posts-list.component.scss',
})
export class PostsListComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  readonly section = signal<'press' | 'views' | 'stalwart'>('press');
  readonly category = signal<string>('');
  readonly items = signal<Post[] | null>(null);
  readonly total = signal(0);
  private page = 0;

  constructor() {
    combineLatest([this.route.data, this.route.paramMap]).subscribe(([d, p]) => {
      this.section.set(d['section']);
      this.category.set(d['section'] === 'stalwart' ? 'stalwart' : p.get('category') ?? '');
      this.page = 0;
      this.items.set(null);
      this.fetch();
    });
  }

  tabs(): string[] {
    return this.section() === 'press' ? MENU.press : this.section() === 'views' ? MENU.views : [];
  }
  base() { return this.section() === 'press' ? '/press' : '/my-views'; }
  sectionTitle() { return { press: 'nav.press', views: 'nav.views', stalwart: 'nav.stalwart' }[this.section()]; }
  lead() { return { press: 'press.lead', views: 'views.lead', stalwart: 'stalwart.lead' }[this.section()]; }
  isQuoteStyle() { return this.section() === 'stalwart' || this.category() === 'quotes'; }

  private fetch() {
    this.api.posts(this.section(), this.category(), this.page, 12).subscribe({
      next: r => { this.items.set([...(this.page ? this.items() ?? [] : []), ...r.items]); this.total.set(r.total); },
      error: () => this.items.set([]),
    });
  }

  loadMore() { this.page++; this.fetch(); }
}
