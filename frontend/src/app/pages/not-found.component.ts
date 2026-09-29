import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TPipe],
  template: `
    <section class="nf">
      <img src="img/logo.jpg" alt="">
      <h1>404</h1>
      <p>{{ 'notfound' | t }}</p>
      <a class="btn" routerLink="/">{{ 'nav.home' | t }}</a>
    </section>
  `,
  styles: [`
    .nf { min-height: 100vh; display: grid; place-content: center; justify-items: center; gap: 10px; text-align: center; background: var(--maroon-grad); color: #fff; }
    img { width: 120px; height: 120px; border-radius: 50%; }
    h1 { font-size: 6rem; margin: 0; background: var(--gold-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
  `],
})
export class NotFoundComponent {}
