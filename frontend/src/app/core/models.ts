export interface Page<T> { items: T[]; total: number; page: number; size: number; }

export interface Post {
  id: number;
  section: 'press' | 'views' | 'stalwart';
  category: string;
  titleEn: string; titleKn?: string;
  bodyEn?: string; bodyKn?: string;
  author?: string;
  image?: string;
  sourceUrl?: string;
  publishedOn?: string;
}

export interface GalleryItem { id: number; category: string; captionEn?: string; captionKn?: string; image: string; }

export interface TimelineEntry {
  id: number; period?: string; titleEn: string; titleKn?: string; descEn?: string; descKn?: string; sortOrder?: number;
}

export interface Enquiry {
  id: number; name: string; phone?: string; email?: string; district?: string; taluk?: string;
  type?: string; subject?: string; message: string; channel: 'email' | 'whatsapp';
  status: 'new' | 'in-progress' | 'resolved'; notes?: string; lang?: string; createdAt: string;
}

export type Channel = 'whatsapp' | 'email' | 'sms' | 'web';

export interface Message {
  id: number; campaignId?: number; channel: Channel; direction: 'in' | 'out'; contact: string; name?: string;
  voucher?: string; subject?: string; body?: string;
  status: 'queued' | 'manual' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled' | 'received';
  providerId?: string; error?: string; adminRead?: boolean; attendedAt?: string; createdAt: string; updatedAt?: string;
}

export interface Campaign {
  id: number; name: string; channel: 'whatsapp' | 'email' | 'sms'; mode: 'api' | 'manual';
  subject?: string; message?: string; template?: string; templateLang?: string;
  voucherMode: 'none' | 'auto' | 'excel' | 'fixed'; voucherInfo?: string; total: number;
  status: 'running' | 'paused' | 'done' | 'cancelled' | 'manual'; createdBy?: string; createdAt: string; finishedAt?: string;
}

export interface CampaignStats {
  total: number; queued: number; sent: number; delivered: number; read: number; failed: number;
  manual: number; cancelled: number; attended: number;
}

export interface CampaignView { campaign: Campaign; stats: CampaignStats; }

export interface Channels {
  whatsappApi: boolean; whatsappInbound: boolean; email: boolean; emailInbound: boolean;
  sms: boolean; smsInbound: boolean; maxRecipients: number;
}

export interface ImportRow { row: number; name?: string; phone?: string; email?: string; voucher?: string; }

export interface ImportResult {
  rows: ImportRow[]; problems: { row: number; reason: string }[]; totalRows: number;
  hasVoucherColumn: boolean; hasPhoneColumn: boolean; hasEmailColumn: boolean;
}

export interface InboxThread {
  channel: Channel; contact: string; name?: string; lastBody: string; lastDirection: 'in' | 'out';
  lastAt: string; unread: number; received: number;
}

export type Settings = Record<string, string>;
