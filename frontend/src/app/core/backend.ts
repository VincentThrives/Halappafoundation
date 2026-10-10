import { Pipe, PipeTransform } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** Backend paths written as '/api/...' or '/uploads/...' are served by the Spring Boot backend. */
const isBackendPath = (url: string) => url.startsWith('/api/') || url.startsWith('/uploads/');

/** Turns a backend path into a full URL on the backend from the current environment; other URLs are returned unchanged. */
export function backendUrl(url: string): string;
export function backendUrl(url: string | null | undefined): string | null | undefined;
export function backendUrl(url: string | null | undefined) {
  return url && isBackendPath(url) ? environment.apiUrl + url : url;
}

/** Sends every '/api/...' request to the backend from the current environment. */
export const apiUrlInterceptor: HttpInterceptorFn = (req, next) =>
  next(isBackendPath(req.url) ? req.clone({ url: backendUrl(req.url) }) : req);

/** For image links stored by the backend: <img [src]="p.image | media">. Uploaded photos live on the backend, site images do not. */
@Pipe({ name: 'media', standalone: true })
export class MediaPipe implements PipeTransform {
  transform(url: string | null | undefined) { return backendUrl(url); }
}
