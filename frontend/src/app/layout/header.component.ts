import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { LangService, TPipe } from '../core/lang.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TPipe, IconComponent, AsyncPipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly lang = inject(LangService);
  readonly settings$ = inject(ApiService).settings();
  readonly menu = MENU;
  readonly scrolled = signal(false);
  readonly drawer = signal(false);
  readonly langOpen = signal(false);

  pickLang(l: 'en' | 'kn') {
    this.lang.set(l);
    this.langOpen.set(false);
  }

  constructor() {
    inject(Router).events.subscribe(e => { if (e instanceof NavigationEnd) this.drawer.set(false); });
  }

  @HostListener('window:scroll')
  onScroll() { this.scrolled.set(scrollY > 60); }
}
