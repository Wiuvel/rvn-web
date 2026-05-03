import { describe, it, expect, afterEach, vi } from 'vitest';

interface SpyHandles {
  log: ReturnType<typeof vi.spyOn>;
  group: ReturnType<typeof vi.spyOn>;
  groupCollapsed: ReturnType<typeof vi.spyOn>;
  groupEnd: ReturnType<typeof vi.spyOn>;
}

function spyConsole(): SpyHandles {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    group: vi.spyOn(console, 'group').mockImplementation(() => {}),
    groupCollapsed: vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {}),
    groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {}),
  };
}

describe('debug utilities', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe('production gate', () => {
    it('debug() is a no-op in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const spies = spyConsole();
      const { debug } = await import('@/lib/utils/debug');
      debug('hi');
      expect(spies.log).not.toHaveBeenCalled();
    });

    it('debugStart / debugEnd / debugError / debugWarn are no-ops in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const spies = spyConsole();
      const { debugStart, debugEnd, debugError, debugWarn } = await import('@/lib/utils/debug');
      debugStart('foo');
      debugEnd('foo');
      debugError('foo', new Error('x'));
      debugWarn('foo', 'nope');
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.group).not.toHaveBeenCalled();
    });

    it('debugPerformance still runs the wrapped function and returns its result', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      spyConsole();
      const { debugPerformance } = await import('@/lib/utils/debug');
      const result = debugPerformance('compute', () => 42);
      expect(result).toBe(42);
    });

    it('debugPerformanceAsync still awaits the wrapped promise', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      spyConsole();
      const { debugPerformanceAsync } = await import('@/lib/utils/debug');
      const result = await debugPerformanceAsync('compute', async () => 'done');
      expect(result).toBe('done');
    });
  });

  describe('development output', () => {
    it('debug() writes to console.log via styled format', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const spies = spyConsole();
      const { debug } = await import('@/lib/utils/debug');
      debug('hello');
      expect(spies.log).toHaveBeenCalled();
      const args = spies.log.mock.calls[0] as unknown as string[];
      expect(args[0]).toContain('hello');
    });

    it('debug() with `group` option opens and closes a console group', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const spies = spyConsole();
      const { debug } = await import('@/lib/utils/debug');
      debug('msg', undefined, { group: 'GroupName' });
      expect(spies.group).toHaveBeenCalled();
      expect(spies.groupEnd).toHaveBeenCalled();
    });

    it('debug() with `collapsed: true` uses console.groupCollapsed', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const spies = spyConsole();
      const { debug } = await import('@/lib/utils/debug');
      debug('msg', undefined, { group: 'G', collapsed: true });
      expect(spies.groupCollapsed).toHaveBeenCalled();
      expect(spies.group).not.toHaveBeenCalled();
    });

    it('debugPerformance returns the result and logs duration', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      const spies = spyConsole();
      const { debugPerformance } = await import('@/lib/utils/debug');
      const result = debugPerformance('compute', () => 'ok');
      expect(result).toBe('ok');
      expect(spies.log).toHaveBeenCalled();
    });

    it('debugPerformance rethrows when the wrapped fn throws', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      spyConsole();
      const { debugPerformance } = await import('@/lib/utils/debug');
      expect(() =>
        debugPerformance('bad', () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');
    });

    it('debugPerformanceAsync rethrows when the wrapped promise rejects', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      spyConsole();
      const { debugPerformanceAsync } = await import('@/lib/utils/debug');
      await expect(
        debugPerformanceAsync('bad', async () => {
          throw new Error('boom-async');
        }),
      ).rejects.toThrow('boom-async');
    });
  });
});
