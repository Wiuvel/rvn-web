import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '@/lib/utils/secure-logger';

interface SpyHandles {
  log: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  info: ReturnType<typeof vi.spyOn>;
}

function spyAllConsole(): SpyHandles {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

describe('SecureLogger - production output', () => {
  let spies: SpyHandles;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    spies = spyAllConsole();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function lastJsonPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
    const call = spy.mock.calls.at(-1) as unknown as [string];
    return JSON.parse(call[0]);
  }

  it('writes a JSON payload via console.log in production', () => {
    logger.error('boom', { foo: 'bar' });
    expect(spies.log).toHaveBeenCalledOnce();
    const payload = lastJsonPayload(spies.log);
    expect(payload.level).toBe('error');
    expect(payload.message).toBe('boom');
    expect(payload.timestamp).toBeTruthy();
    expect(payload.context).toEqual({ foo: 'bar' });
  });

  it('redacts password / token / secret / cookie / csrf fields', () => {
    logger.info('login attempt', {
      password: 'plaintext-secret',
      access_token: 'abc',
      session_secret: 'xyz',
      cookie: 'sid=123',
      csrf_token: 'tok',
      authorization: 'Bearer ...',
      api_key: 'k',
    });
    const payload = lastJsonPayload(spies.log);
    const ctx = payload.context as Record<string, string>;
    expect(ctx.password).toBe('[REDACTED]');
    expect(ctx.access_token).toBe('[REDACTED]');
    expect(ctx.session_secret).toBe('[REDACTED]');
    expect(ctx.cookie).toBe('[REDACTED]');
    expect(ctx.csrf_token).toBe('[REDACTED]');
    expect(ctx.authorization).toBe('[REDACTED]');
    expect(ctx.api_key).toBe('[REDACTED]');
  });

  it('anonymizes IPv4 addresses (last octet → xxx)', () => {
    logger.info('request', { ip: '192.168.1.42' });
    const payload = lastJsonPayload(spies.log);
    const ctx = payload.context as Record<string, string>;
    expect(ctx.ip).toBe('192.168.1.xxx');
  });

  it('anonymizes IPv6 addresses (preserves first three groups)', () => {
    logger.info('request', { client_ip: '2001:db8:85a3:0000:0000:8a2e:0370:7334' });
    const payload = lastJsonPayload(spies.log);
    const ctx = payload.context as Record<string, string>;
    expect(ctx.client_ip.startsWith('2001:db8:85a3:')).toBe(true);
    expect(ctx.client_ip).toContain('xxxx');
  });

  it('keeps "unknown" IP marker as-is', () => {
    logger.info('request', { ip: 'unknown' });
    const payload = lastJsonPayload(spies.log);
    expect((payload.context as Record<string, string>).ip).toBe('unknown');
  });

  it('recursively sanitizes nested objects', () => {
    logger.error('nested', { request: { headers: { authorization: 'Bearer x' }, ip: '1.2.3.4' } });
    const payload = lastJsonPayload(spies.log);
    const ctx = payload.context as { request: { headers: { authorization: string }; ip: string } };
    expect(ctx.request.headers.authorization).toBe('[REDACTED]');
    expect(ctx.request.ip).toBe('1.2.3.xxx');
  });

  it('preserves non-sensitive fields untouched', () => {
    logger.info('event', { userId: 'usr_123', action: 'click', count: 5 });
    const payload = lastJsonPayload(spies.log);
    const ctx = payload.context as Record<string, unknown>;
    expect(ctx.userId).toBe('usr_123');
    expect(ctx.action).toBe('click');
    expect(ctx.count).toBe(5);
  });

  it('omits context entirely when none is provided', () => {
    logger.warn('plain message');
    const payload = lastJsonPayload(spies.log);
    expect(payload.context).toBeUndefined();
  });
});

describe('SecureLogger - debug gate', () => {
  let spies: SpyHandles;

  beforeEach(() => {
    spies = spyAllConsole();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('debug() is a no-op outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    logger.debug('debug-msg', { foo: 'bar' });
    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it('debug() emits in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    logger.debug('debug-msg', { foo: 'bar' });
    // In development the formatted output goes through console.log (debug level)
    expect(spies.log).toHaveBeenCalled();
  });
});

describe('SecureLogger - dev formatting', () => {
  let spies: SpyHandles;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    spies = spyAllConsole();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('routes error() to console.error with a human-readable prefix', () => {
    logger.error('boom');
    expect(spies.error).toHaveBeenCalledOnce();
    const [msg] = spies.error.mock.calls[0] as unknown as [string];
    expect(msg).toMatch(/Error: boom/);
  });

  it('routes warn() to console.warn', () => {
    logger.warn('careful');
    expect(spies.warn).toHaveBeenCalledOnce();
  });

  it('routes info() to console.info', () => {
    logger.info('fyi');
    expect(spies.info).toHaveBeenCalledOnce();
  });
});
