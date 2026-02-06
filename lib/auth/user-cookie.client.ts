import type { UserDataPayload } from './types';

/**
 * Парсит user_data cookie на клиенте (без верификации HMAC).
 * Используется для мгновенного отображения UI.
 */
export function parseUserDataCookieClient(cookieValue?: string | null): UserDataPayload | null {
  const value = cookieValue ?? (typeof document !== 'undefined' ? getCookie('user_data') : null);
  if (!value || typeof value !== 'string') return null;

  const dotIdx = value.lastIndexOf('.');
  if (dotIdx === -1) return null;

  const dataB64 = value.slice(0, dotIdx);
  if (!dataB64) return null;

  try {
    const json = base64UrlDecodeToUtf8(dataB64);
    const payload = JSON.parse(json) as UserDataPayload;
    
    if (!payload.user_id || typeof payload.user_id !== 'string') return null;
    if (!payload.username || typeof payload.username !== 'string') return null;
    
    return payload;
  } catch {
    return null;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function base64UrlDecodeToUtf8(str: string): string {
  // Заменяем символы Base64Url на стандартный Base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Добавляем паддинг если нужно
  const pad = base64.length % 4;
  if (pad) base64 += '='.repeat(4 - pad);
  
  // Декодируем
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  
  return new TextDecoder().decode(bytes);
}
