import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';
import { IconComponent } from '../core/icon.component';
import { CountUpDirective, RevealDirective } from '../core/motion';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink, TPipe, IconComponent, RevealDirective, CountUpDirective],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  readonly facts = ['father', 'native', 'qual', 'family'];
  readonly reach = [{ k: 'ka', n: 22 }, { k: 'tn', n: 15 }, { k: 'ap', n: 5 }];
}
