import type { ArtStyle, EntityData, EntitySummary, EntityView, LevelPrompt, Meta } from './types';

const TOKEN_KEY = 'ccst-admin-token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* bỏ qua */
  }
}

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = { 'x-admin-token': getToken() };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, signal });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = Array.isArray(j.message) ? j.message.join(', ') : j.message ?? msg;
    } catch {
      /* không phải JSON */
    }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  meta: () => req<Meta>('GET', '/api/meta'),
  list: (type?: string) => req<EntitySummary[]>('GET', `/api/entities${type ? `?type=${type}` : ''}`),
  get: (id: string) => req<EntityView>('GET', `/api/entities/${id}`),
  create: (data: EntityData) => req<EntityView>('POST', '/api/entities', data),
  update: (id: string, data: EntityData) => req<EntityView>('PUT', `/api/entities/${id}`, data),
  remove: (id: string) => req<{ ok: true }>('DELETE', `/api/entities/${id}`),
  uploadImage: (id: string, level: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<EntityView>('POST', `/api/entities/${id}/levels/${level}/image`, fd);
  },
  clearImage: (id: string, level: number) => req<EntityView>('DELETE', `/api/entities/${id}/levels/${level}/image`),
  previewPrompts: (data: EntityData, signal?: AbortSignal) => req<LevelPrompt[]>('POST', '/api/art/preview-prompts', data, signal),
  artStyle: () => req<ArtStyle>('GET', '/api/settings/art-style'),
  artStyleDefault: () => req<ArtStyle>('GET', '/api/settings/art-style/default'),
  saveArtStyle: (s: ArtStyle) => req<ArtStyle>('PUT', '/api/settings/art-style', s),
  exportFiles: () => req<{ count: number }>('POST', '/api/export-files'),
};
