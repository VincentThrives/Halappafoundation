import { Routes } from '@angular/router';
import { adminGuard } from './core/auth.service';
import { PublicLayoutComponent } from './layout/public-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', loadComponent: () => import('./pages/home.component').then(m => m.HomeComponent) },
      { path: 'about', loadComponent: () => import('./pages/about.component').then(m => m.AboutComponent) },
      { path: 'stalwart-says', data: { section: 'stalwart' }, loadComponent: () => import('./pages/posts-list.component').then(m => m.PostsListComponent) },
      { path: 'press', pathMatch: 'full', redirectTo: 'press/news' },
      { path: 'press/:category', data: { section: 'press' }, loadComponent: () => import('./pages/posts-list.component').then(m => m.PostsListComponent) },
      { path: 'my-views', pathMatch: 'full', redirectTo: 'my-views/articles' },
      { path: 'my-views/:category', data: { section: 'views' }, loadComponent: () => import('./pages/posts-list.component').then(m => m.PostsListComponent) },
      { path: 'post/:id', loadComponent: () => import('./pages/post-detail.component').then(m => m.PostDetailComponent) },
      { path: 'gallery', loadComponent: () => import('./pages/gallery.component').then(m => m.GalleryComponent) },
      { path: 'gallery/:category', loadComponent: () => import('./pages/gallery.component').then(m => m.GalleryComponent) },
      { path: 'timeline', loadComponent: () => import('./pages/timeline.component').then(m => m.TimelineComponent) },
      { path: 'contact', loadComponent: () => import('./pages/contact.component').then(m => m.ContactComponent) },
    ],
  },
  { path: 'admin/login', loadComponent: () => import('./admin/login.component').then(m => m.LoginComponent) },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', loadComponent: () => import('./admin/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'enquiries', loadComponent: () => import('./admin/enquiries.component').then(m => m.EnquiriesComponent) },
      { path: 'inbox', loadComponent: () => import('./admin/inbox.component').then(m => m.InboxComponent) },
      { path: 'messages', loadComponent: () => import('./admin/campaigns.component').then(m => m.CampaignsComponent) },
      { path: 'messages/new', loadComponent: () => import('./admin/new-campaign.component').then(m => m.NewCampaignComponent) },
      { path: 'messages/:id', loadComponent: () => import('./admin/campaigns.component').then(m => m.CampaignDetailComponent) },
      { path: 'vouchers', loadComponent: () => import('./admin/vouchers.component').then(m => m.VouchersComponent) },
      { path: 'whatsapp', pathMatch: 'full', redirectTo: 'messages/new' },
      { path: 'posts', loadComponent: () => import('./admin/posts.component').then(m => m.AdminPostsComponent) },
      { path: 'gallery', loadComponent: () => import('./admin/gallery.component').then(m => m.AdminGalleryComponent) },
      { path: 'timeline', loadComponent: () => import('./admin/timeline.component').then(m => m.AdminTimelineComponent) },
      { path: 'settings', loadComponent: () => import('./admin/settings.component').then(m => m.SettingsComponent) },
    ],
  },
  { path: '**', loadComponent: () => import('./pages/not-found.component').then(m => m.NotFoundComponent) },
];
