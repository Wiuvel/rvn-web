import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '@/lib/trpc/init';
import { appRouter } from '@/lib/trpc/routers/root';
import type { Context } from '@/lib/trpc/init';

function createMockContext(overrides: Partial<{ headers: Headers; req: Request }> = {}) {
  const headers = new Headers(overrides.headers ?? undefined);
  const req = overrides.req ?? new Request('http://localhost');
  return { req, headers } as Context;
}

describe('API: protection router', () => {
  const createCaller = createCallerFactory(appRouter);

  describe('protection.getIp', () => {
    it('возвращает IP из x-forwarded-for', async () => {
      const ctx = createMockContext();
      ctx.headers.set('x-forwarded-for', '192.168.1.1');
      const caller = createCaller(ctx);
      const result = await caller.protection.getIp();
      expect(result.ip).toBe('192.168.1.1');
    });

    it('берёт первый адрес из x-forwarded-for при списке', async () => {
      const ctx = createMockContext();
      ctx.headers.set('x-forwarded-for', '10.0.0.1, 192.168.1.1, 172.16.0.1');
      const caller = createCaller(ctx);
      const result = await caller.protection.getIp();
      expect(result.ip).toBe('10.0.0.1');
    });

    it('использует x-real-ip если x-forwarded-for пуст', async () => {
      const ctx = createMockContext();
      ctx.headers.set('x-real-ip', '203.0.113.50');
      const caller = createCaller(ctx);
      const result = await caller.protection.getIp();
      expect(result.ip).toBe('203.0.113.50');
    });

    it('использует cf-connecting-ip если остальные пусты', async () => {
      const ctx = createMockContext();
      ctx.headers.set('cf-connecting-ip', '104.16.0.1');
      const caller = createCaller(ctx);
      const result = await caller.protection.getIp();
      expect(result.ip).toBe('104.16.0.1');
    });

    it('возвращает fallback если заголовков нет', async () => {
      const ctx = createMockContext();
      const caller = createCaller(ctx);
      const result = await caller.protection.getIp();
      expect(result.ip).toBe('Не удалось определить');
    });
  });
});
