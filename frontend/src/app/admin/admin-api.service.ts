import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { toParams } from '../core/api.service';
import { CampaignView, Channels, Enquiry, GalleryItem, ImportResult, InboxThread, Message, Page, Post, Settings, TimelineEntry } from '../core/models';

export interface EnquiryQuery {
  q?: string; status?: string; channel?: string; type?: string; from?: string; to?: string;
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);

  dashboard() { return this.http.get<any>('/api/admin/dashboard'); }

  // Enquiries
  enquiries(q: EnquiryQuery, page: number, size: number) {
    return this.http.get<Page<Enquiry>>('/api/admin/enquiries', { params: toParams({ ...q, page, size }) });
  }
  updateEnquiry(id: number, body: { status?: string; notes?: string }) { return this.http.patch<Enquiry>(`/api/admin/enquiries/${id}`, body); }
  deleteEnquiries(ids: number[]) { return this.http.post('/api/admin/enquiries/delete', { ids }); }
  /** all=true ignores every filter; otherwise ids (if any) or the filters, with inclusive from/to dates. */
  exportEnquiries(q: EnquiryQuery, ids?: number[], all = false) {
    return this.http.get('/api/admin/enquiries/export', {
      params: all ? toParams({ all: true }) : toParams({ ...q, ids: ids?.length ? ids : undefined }),
      responseType: 'blob', observe: 'response',
    }).pipe(map(r => {
      const cd = r.headers.get('Content-Disposition') ?? '';
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'enquiries.xlsx';
      return { blob: r.body!, name };
    }));
  }

  // Bulk messages (campaigns)
  channels() { return this.http.get<Channels>('/api/admin/campaigns/channels'); }
  importRecipients(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportResult>('/api/admin/campaigns/import', fd);
  }
  recipientsTemplate() { return this.blob('/api/admin/campaigns/template', {}); }
  campaigns() { return this.http.get<CampaignView[]>('/api/admin/campaigns'); }
  campaign(id: number) { return this.http.get<CampaignView>(`/api/admin/campaigns/${id}`); }
  createCampaign(body: Record<string, unknown>) { return this.http.post<CampaignView>('/api/admin/campaigns', body); }
  campaignRecipients(id: number, status: string, q: string, page: number, size = 50) {
    return this.http.get<Page<Message>>(`/api/admin/campaigns/${id}/recipients`, { params: toParams({ status, q, page, size }) });
  }
  campaignAction(id: number, action: 'pause' | 'resume' | 'cancel' | 'retry-failed') {
    return this.http.post<CampaignView>(`/api/admin/campaigns/${id}/${action}`, {});
  }
  exportCampaign(id: number) { return this.blob(`/api/admin/campaigns/${id}/export`, {}); }
  manualSent(id: number, messageId: number) {
    return this.http.post<Message>(`/api/admin/campaigns/${id}/recipients/${messageId}/manual-sent`, {});
  }

  // Inbox
  threads(channel: string, q: string, includeSentOnly: boolean, page: number) {
    return this.http.get<Page<InboxThread>>('/api/admin/inbox/threads', { params: toParams({ channel, q, includeSentOnly, page, size: 30 }) });
  }
  thread(channel: string, contact: string) { return this.http.get<Message[]>('/api/admin/inbox/thread', { params: { channel, contact } }); }
  unread() { return this.http.get<{ unread: number }>('/api/admin/inbox/unread'); }
  messageLog(f: Record<string, unknown>, page: number) {
    return this.http.get<Page<Message>>('/api/admin/inbox/messages', { params: toParams({ ...f, page, size: 50 }) });
  }
  reply(body: { channel: string; contact: string; subject?: string; text: string }) {
    return this.http.post<{ message: Message; link?: string }>('/api/admin/inbox/reply', body);
  }

  // Voucher check-in
  findVoucher(code: string) { return this.http.get<Message[]>('/api/admin/vouchers', { params: { code } }); }
  attend(messageId: number) { return this.http.post<Message>(`/api/admin/vouchers/${messageId}/attend`, {}); }

  private blob(url: string, params: Record<string, unknown>) {
    return this.http.get(url, { params: toParams(params), responseType: 'blob', observe: 'response' }).pipe(map(r => {
      const cd = r.headers.get('Content-Disposition') ?? '';
      return { blob: r.body!, name: /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'download.xlsx' };
    }));
  }

  // Posts
  posts(section: string, category: string, page: number) {
    return this.http.get<Page<Post>>('/api/admin/posts', { params: toParams({ section, category, page, size: 20 }) });
  }
  savePost(id: number | null, fd: FormData) {
    return id ? this.http.put<Post>(`/api/admin/posts/${id}`, fd) : this.http.post<Post>('/api/admin/posts', fd);
  }
  deletePost(id: number) { return this.http.delete(`/api/admin/posts/${id}`); }

  // Gallery
  gallery(category?: string) { return this.http.get<GalleryItem[]>('/api/admin/gallery', { params: toParams({ category }) }); }
  uploadPhotos(fd: FormData) { return this.http.post<GalleryItem[]>('/api/admin/gallery', fd); }
  updatePhoto(id: number, body: Partial<GalleryItem>) { return this.http.put<GalleryItem>(`/api/admin/gallery/${id}`, body); }
  deletePhoto(id: number) { return this.http.delete(`/api/admin/gallery/${id}`); }

  // Timeline
  timeline() { return this.http.get<TimelineEntry[]>('/api/admin/timeline'); }
  saveTimeline(id: number | null, body: Partial<TimelineEntry>) {
    return id ? this.http.put<TimelineEntry>(`/api/admin/timeline/${id}`, body) : this.http.post<TimelineEntry>('/api/admin/timeline', body);
  }
  deleteTimeline(id: number) { return this.http.delete(`/api/admin/timeline/${id}`); }

  // Settings
  settings() { return this.http.get<Settings>('/api/admin/settings'); }
  saveSettings(s: Settings) { return this.http.put<Settings>('/api/admin/settings', s); }
  changePassword(current: string, next: string) { return this.http.post('/api/auth/change-password', { current, next }); }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
