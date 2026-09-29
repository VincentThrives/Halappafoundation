import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header.component';
import { FooterComponent } from './footer.component';
import { SocialFloatComponent } from './social-float.component';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, SocialFloatComponent],
  template: `
    <app-header />
    <main><router-outlet /></main>
    <app-footer />
    <app-social-float />
  `,
  styles: [`main { min-height: 60vh; }`],
})
export class PublicLayoutComponent {}
