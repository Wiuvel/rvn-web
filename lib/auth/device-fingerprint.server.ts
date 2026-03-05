/**
 * Layer 2: Server-side device fingerprint for grouping
 * Computes hash from User-Agent + IP prefix + optional FPID
 * Used for grouping devices in user_devices table
 */

import { createHash } from 'crypto';

function normalizeUserAgent(ua: string): string {
  const browserMatch = ua.match(
    /(Chrome|Firefox|Safari|Edge|Opera|Brave|Vivaldi|YandexBrowser|YaBrowser|OPR)/i,
  );
  const osMatch = ua.match(/(Windows NT|Mac OS X|Linux|Android|iPhone|iPad)/i);
  const browser = browserMatch ? browserMatch[1].toLowerCase().replace(/\s/g, '_') : 'unknown';
  let os = 'unknown';
  if (osMatch) {
    const m = osMatch[1].toLowerCase();
    if (m.includes('windows')) os = 'windows';
    else if (m.includes('mac')) os = 'mac';
    else if (m.includes('linux')) os = 'linux';
    else if (m.includes('android')) os = 'android';
    else if (m.includes('iphone') || m.includes('ipad')) os = 'ios';
  }
  return `${browser}:${os}`;
}

function normalizeIpPrefix(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  if (ip.includes('.')) {
    const parts = ip.split(',')[0].trim().split('.');
    if (parts.length >= 3) return parts.slice(0, 3).join('.');
  }
  if (ip.includes(':')) {
    const parts = ip.split(',')[0].trim().split(':');
    if (parts.length >= 4) return parts.slice(0, 4).join(':');
  }
  return ip;
}

/**
 * Compute device fingerprint hash for grouping.
 * Same UA + IP prefix + FPID => same hash => same logical device
 */
export function computeDeviceFpHash(
  userAgent: string,
  ipAddress: string,
  fpid?: string | null,
): string {
  const uaNorm = normalizeUserAgent(userAgent);
  const ipNorm = normalizeIpPrefix(ipAddress);
  const payload = fpid ? `${uaNorm}|${ipNorm}|${fpid}` : `${uaNorm}|${ipNorm}`;
  return createHash('sha256').update(payload).digest('hex');
}
