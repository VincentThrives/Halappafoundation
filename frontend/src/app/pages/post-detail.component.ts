import { Component, computed, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, Location } from '@angular/common';
import { LangService, LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { IconComponent } from '../core/icon.component';
import { RevealDirective, paragraphs } from '../core/motion';
import { Post } from '../core/models';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [MediaPipe, RouterLink, TPipe, LocPipe, DatePipe, IconComponent, RevealDirective],
  templateUrl: './post-detail.component.html',
  styleUrl: './post-detail.component.scss',
})
export class PostDetailComponent {
  private api = inject(ApiService);
  private lang = inject(LangService);
  private location = inject(Location);
  readonly post = signal<Post | null>(null);
  readonly missing = signal(false);
  readonly body = computed(() => paragraphs(this.lang.pick(this.post(), 'body')));

  constructor() {
    inject(ActivatedRoute).paramMap.subscribe(p => {
      this.post.set(null);
      this.api.post(Number(p.get('id'))).subscribe({ next: x => this.post.set(x), error: () => this.missing.set(true) });
    });
  }

  back() { this.location.back(); }
}
