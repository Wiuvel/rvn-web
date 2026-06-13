import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above the file body, so shared spies/state must be too.
const { warnSpy, checkAdminExists, dbRows } = vi.hoisted(() => ({
  warnSpy: vi.fn<() => void>(),
  checkAdminExists: vi.fn<() => Promise<boolean>>(),
  dbRows: { remnawave_endpoint: '', remnawave_api_key: '' } as Record<string, string>,
}));

vi.mock('@/lib/utils/secure-logger', () => ({
  logger: { info: vi.fn<() => void>(), warn: warnSpy, error: vi.fn<() => void>() },
}));

// checkAdminExists is imported dynamically inside getSubscriptionSystemStatus.
vi.mock('@/lib/auth/index', () => ({ checkAdminExists }));
vi.mock('@/lib/database/schema', () => ({ panelSettings: { key: 'key', value: 'value' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn<() => void>() }));
vi.mock('@/lib/database/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (cond: { key: string }) => ({
          limit: () => {
            const value = dbRows[cond.key as keyof typeof dbRows];
            return Promise.resolve(value ? [{ value }] : []);
          },
        }),
      }),
    }),
  },
}));

// The eq mock returns the key so the db mock can branch on which row is queried.
import { eq } from 'drizzle-orm';
vi.mocked(eq).mockImplementation((_col: unknown, val: unknown) => ({ key: val }) as never);

import { getSubscriptionSystemStatus, invalidateSettingsCache } from '@/lib/integrations/remnawave';

describe('getSubscriptionSystemStatus', () => {
  beforeEach(() => {
    invalidateSettingsCache(); // clears status cache + warn latch
    warnSpy.mockClear();
    checkAdminExists.mockReset();
    dbRows.remnawave_endpoint = '';
    dbRows.remnawave_api_key = '';
  });

  it('is inactive with reason no_admin when no admin exists', async () => {
    checkAdminExists.mockResolvedValue(false);
    expect(await getSubscriptionSystemStatus()).toEqual({ active: false, reason: 'no_admin' });
  });

  it('is inactive with reason not_configured when admin exists but panel unset', async () => {
    checkAdminExists.mockResolvedValue(true);
    expect(await getSubscriptionSystemStatus()).toEqual({
      active: false,
      reason: 'not_configured',
    });
  });

  it('is active when admin exists and panel is configured', async () => {
    checkAdminExists.mockResolvedValue(true);
    dbRows.remnawave_endpoint = 'https://panel.example.com';
    dbRows.remnawave_api_key = 'token';
    expect(await getSubscriptionSystemStatus()).toEqual({ active: true });
  });

  it('warns only once across repeated inactive calls', async () => {
    checkAdminExists.mockResolvedValue(false);
    await getSubscriptionSystemStatus();
    await getSubscriptionSystemStatus();
    await getSubscriptionSystemStatus();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('re-warns after invalidateSettingsCache resets the latch', async () => {
    checkAdminExists.mockResolvedValue(false);
    await getSubscriptionSystemStatus();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    invalidateSettingsCache();
    await getSubscriptionSystemStatus();
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
