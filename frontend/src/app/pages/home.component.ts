import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { MediaPipe } from '../core/backend';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { LangService, LocPipe, TPipe } from '../core/lang.service';
import { ApiService } from '../core/api.service';
import { IconComponent } from '../core/icon.component';
import { CountUpDirective, ParallaxDirective, RevealDirective } from '../core/motion';
import { GalleryItem, Post } from '../core/models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MediaPipe, RouterLink, TPipe, LocPipe, IconComponent, RevealDirective, CountUpDirective, ParallaxDirective, DatePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  readonly lang = inject(LangService);
  private api = inject(ApiService);

  readonly slides = [
    { key: 'hero.s1', img: 'img/portrait.jpg', round: false },
    { key: 'hero.s2', img: 'img/office.jpg', round: false },
    { key: 'hero.s3', img: 'img/logo.jpg', round: true },
  ];
  readonly initiatives = [
    { n: 1, icon: 'skill' }, { n: 2, icon: 'school' }, { n: 3, icon: 'briefcase' },
    { n: 4, icon: 'store' }, { n: 5, icon: 'plane' }, { n: 6, icon: 'house' },
  ];
  readonly current = signal(0);
  readonly posts = signal<Post[] | null>(null);
  readonly photos = signal<GalleryItem[]>([]);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.start();
    this.api.posts(undefined, undefined, 0, 3).subscribe({ next: p => this.posts.set(p.items), error: () => this.posts.set([]) });
    this.api.gallery().subscribe({ next: g => this.photos.set(g.slice(0, 8)), error: () => {} });
  }

  go(i: number) { this.current.set(i); this.start(); }

  private start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.current.set((this.current() + 1) % this.slides.length), 6500);
  }

  ngOnDestroy() { clearInterval(this.timer); }
}
