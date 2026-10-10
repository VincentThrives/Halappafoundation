import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';
import { MENU } from '../core/i18n';
import { IconComponent } from '../core/icon.component';
import { ApiService } from '../core/api.service';
import { RevealDirective } from '../core/motion';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TPipe, IconComponent, AsyncPipe, RevealDirective],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  readonly settings$ = inject(ApiService).settings();
  readonly menu = MENU;
  readonly year = new Date().getFullYear();
}
