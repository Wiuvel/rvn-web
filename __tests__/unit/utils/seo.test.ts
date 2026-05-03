import { describe, it, expect } from 'vitest';
import { generateMetadata, pageMetadata, createArticleMetadata } from '@/lib/utils/seo';

describe('generateMetadata', () => {
  describe('title resolution', () => {
    it('falls back to default site title when no title is given', () => {
      const meta = generateMetadata({});
      expect(meta.title).toBe('RVN - безопасный доступ в сеть');
    });

    it('uses the bare site name when title equals "RVN"', () => {
      const meta = generateMetadata({ title: 'RVN' });
      expect(meta.title).toBe('RVN');
    });

    it('keeps RVN-prefixed titles intact (no " | RVN" suffix)', () => {
      const meta = generateMetadata({ title: 'RVN — Маркет' });
      expect(meta.title).toBe('RVN — Маркет');
    });

    it('keeps the legacy "RVN - безопасный доступ в сеть" title intact', () => {
      const meta = generateMetadata({ title: 'RVN - безопасный доступ в сеть' });
      expect(meta.title).toBe('RVN - безопасный доступ в сеть');
    });

    it('appends " | RVN" suffix to non-prefixed titles', () => {
      const meta = generateMetadata({ title: 'Авторизация' });
      expect(meta.title).toBe('Авторизация | RVN');
    });

    it('does not append the suffix when the title contains "RVN" elsewhere', () => {
      // The guard only matches `siteName === title`, prefix `RVN `, or the legacy phrase.
      // A title like "Foo RVN" should still get the suffix.
      const meta = generateMetadata({ title: 'Foo RVN' });
      expect(meta.title).toBe('Foo RVN | RVN');
    });
  });

  describe('description resolution', () => {
    it('uses the provided description', () => {
      const meta = generateMetadata({ description: 'custom description' });
      expect(meta.description).toBe('custom description');
    });

    it('falls back to a default description when omitted', () => {
      const meta = generateMetadata({});
      expect(meta.description).toContain('RVN.MARKET');
    });
  });

  describe('keywords', () => {
    it('always prepends the base keyword set', () => {
      const meta = generateMetadata({ keywords: ['custom-kw'] });
      expect(meta.keywords).toContain('RVN');
      expect(meta.keywords).toContain('rvn.market');
      expect(meta.keywords).toContain('Vless');
      expect(meta.keywords).toContain('Hysteria');
      expect(meta.keywords).toContain('Proxy');
      expect(meta.keywords).toContain('custom-kw');
    });

    it('joins keywords with ", "', () => {
      const meta = generateMetadata({ keywords: ['a', 'b'] });
      expect(meta.keywords).toMatch(/RVN, rvn\.market, Vless, Hysteria, Proxy, a, b/);
    });
  });

  describe('canonical URL', () => {
    it('uses base URL when no path is provided', () => {
      const meta = generateMetadata({});
      expect(meta.alternates?.canonical).toBeTruthy();
    });

    it('appends the path to the base URL', () => {
      const meta = generateMetadata({ url: '/foo' });
      const canonical = meta.alternates?.canonical as string;
      expect(canonical.endsWith('/foo')).toBe(true);
    });
  });

  describe('robots / noindex', () => {
    it('marks page as indexable by default', () => {
      const meta = generateMetadata({});
      const robots = meta.robots as { index: boolean; follow: boolean };
      expect(robots.index).toBe(true);
      expect(robots.follow).toBe(true);
    });

    it('respects noindex flag', () => {
      const meta = generateMetadata({ noindex: true });
      const robots = meta.robots as Record<string, unknown>;
      expect(robots.index).toBe(false);
      expect(robots.follow).toBe(false);
      expect(robots['max-snippet']).toBeUndefined();
    });
  });

  describe('openGraph', () => {
    it('defaults type to "website"', () => {
      const meta = generateMetadata({});
      expect(meta.openGraph?.type).toBe('website');
    });

    it('includes article-specific fields when provided', () => {
      const meta = generateMetadata({
        type: 'article',
        publishedTime: '2026-05-01T00:00:00Z',
        modifiedTime: '2026-05-02T00:00:00Z',
        author: 'Wiuvel',
        section: 'News',
        tags: ['vpn', 'launch'],
      });
      const og = meta.openGraph as Record<string, unknown>;
      expect(og.type).toBe('article');
      expect(og.publishedTime).toBe('2026-05-01T00:00:00Z');
      expect(og.modifiedTime).toBe('2026-05-02T00:00:00Z');
      expect(og.authors).toEqual(['Wiuvel']);
      expect(og.section).toBe('News');
      expect(og.tags).toEqual(['vpn', 'launch']);
    });

    it('omits article-only fields for website type', () => {
      const meta = generateMetadata({});
      const og = meta.openGraph as Record<string, unknown>;
      expect(og.publishedTime).toBeUndefined();
      expect(og.authors).toBeUndefined();
      expect(og.section).toBeUndefined();
    });

    it('uses the resolved fullTitle in og:image alt', () => {
      const meta = generateMetadata({ title: 'Авторизация' });
      const og = meta.openGraph as { images: Array<{ alt: string }> };
      expect(og.images[0].alt).toBe('Авторизация | RVN');
    });
  });
});

describe('pageMetadata', () => {
  it('home title is preserved as-is (RVN-prefixed)', () => {
    expect(pageMetadata.home.title).toBe('RVN — Сервис приватного доступа в сеть');
  });

  it('auth page title gets the " | RVN" suffix', () => {
    expect(pageMetadata.auth.title).toBe('Авторизация | RVN');
  });

  it('dashboard page is marked noindex', () => {
    const robots = pageMetadata.dashboard.robots as { index: boolean };
    expect(robots.index).toBe(false);
  });

  it('legal page is indexable', () => {
    const robots = pageMetadata.legal.robots as { index: boolean };
    expect(robots.index).toBe(true);
  });
});

describe('createArticleMetadata', () => {
  it('forces type to "article"', () => {
    const meta = createArticleMetadata({
      title: 'Launch announcement',
      description: 'desc',
      publishedTime: '2026-05-01T00:00:00Z',
      url: '/blog/launch',
    });
    expect(meta.openGraph?.type).toBe('article');
  });

  it('defaults author to "RVN"', () => {
    const meta = createArticleMetadata({
      title: 'X',
      description: 'desc',
      publishedTime: '2026-05-01T00:00:00Z',
      url: '/blog/x',
    });
    const og = meta.openGraph as { authors: string[] };
    expect(og.authors).toEqual(['RVN']);
  });

  it('auto-fills modifiedTime when omitted', () => {
    const meta = createArticleMetadata({
      title: 'X',
      description: 'desc',
      publishedTime: '2026-05-01T00:00:00Z',
      url: '/blog/x',
    });
    const og = meta.openGraph as { modifiedTime: string };
    expect(og.modifiedTime).toBeTruthy();
  });
});
