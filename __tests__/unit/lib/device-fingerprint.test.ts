import { describe, it, expect } from 'vitest';
import { computeDeviceFpHash } from '@/lib/auth/device-fingerprint.server';

describe('computeDeviceFpHash', () => {
  const chromeUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
  const firefoxUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';

  it('детерминированность: одинаковые входы → одинаковый хеш', () => {
    const hash1 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    const hash2 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    expect(hash1).toBe(hash2);
  });

  it('разный UA или IP → разный хеш', () => {
    const h1 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    const h2 = computeDeviceFpHash(firefoxUA, '192.168.1.1');
    expect(h1).not.toBe(h2);
    const h3 = computeDeviceFpHash(chromeUA, '10.0.0.1');
    expect(h1).not.toBe(h3);
  });

  it('одинаковый IP-префикс (последний октет игнорируется) → одинаковый хеш', () => {
    const hash1 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    const hash2 = computeDeviceFpHash(chromeUA, '192.168.1.254');
    expect(hash1).toBe(hash2);
  });

  it('fpid влияет на хеш', () => {
    const h1 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    const h2 = computeDeviceFpHash(chromeUA, '192.168.1.1', 'MP_abc123');
    expect(h1).not.toBe(h2);
  });

  it('null fpid = без fpid', () => {
    const h1 = computeDeviceFpHash(chromeUA, '192.168.1.1');
    const h2 = computeDeviceFpHash(chromeUA, '192.168.1.1', null);
    expect(h1).toBe(h2);
  });

  it('хеш имеет длину 64 (sha256 hex)', () => {
    const hash = computeDeviceFpHash(chromeUA, '192.168.1.1');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('обрабатывает forwarded IP (с запятыми)', () => {
    const h1 = computeDeviceFpHash(chromeUA, '192.168.1.1, 10.0.0.1');
    const h2 = computeDeviceFpHash(chromeUA, '192.168.1.254');
    expect(h1).toBe(h2);
  });
});
