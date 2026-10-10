import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/lang.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TPipe],
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {}
