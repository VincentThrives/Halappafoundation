import { Component, HostListener, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';
import { TPipe } from '../core/lang.service';

/** Mail / Facebook / WhatsApp / Instagram pinned to the right edge, mid-screen, on every public page. */
@Component({
  selector: 'app-social-float',
  standalone: true,
  imports: [IconComponent, AsyncPipe, TPipe, RouterLink],
  templateUrl: './social-float.component.html',
  styleUrl: './social-float.component.scss',
})
export class SocialFloatComponent {
  readonly settings$ = inject(ApiService).settings();
  readonly progress = signal(0);

  @HostListener('window:scroll')
  onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    this.progress.set(max > 0 ? Math.min(scrollY / max, 1) : 0);
  }

  top() { scrollTo({ top: 0, behavior: 'smooth' }); }
}
