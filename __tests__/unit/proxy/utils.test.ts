import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { isStaticFile, shouldBypassProxy } from '@/lib/proxy/utils';

describe('isStaticFile', () => {
  it('matches the canonical static endpoints', () => {
    expect(isStaticFile('/favicon.ico')).toBe(true);
    expect(isStaticFile('/robots.txt')).toBe(true);
    expect(isStaticFile('/sitemap.xml')).toBe(true);
  });

  it('matches the framework asset prefixes', () => {
    expect(isStaticFile('/_next/static/chunks/main.js')).toBe(true);
    expect(isStaticFile('/static/og-image.png')).toBe(true);
    expect(isStaticFile('/public/favicon.svg')).toBe(true);
  });

  it('matches static files by extension', () => {
    expect(isStaticFile('/images/logo.png')).toBe(true);
    expect(isStaticFile('/foo/bar.JPG')).toBe(true); // case-insensitive
    expect(isStaticFile('/fonts/iter.woff2')).toBe(true);
    expect(isStaticFile('/scripts/app.js')).toBe(true);
    expect(isStaticFile('/styles/main.css')).toBe(true);
    expect(isStaticFile('/maps/main.js.map')).toBe(true);
  });

  it('does not match application routes', () => {
    expect(isStaticFile('/')).toBe(false);
    expect(isStaticFile('/dashboard')).toBe(false);
    expect(isStaticFile('/auth')).toBe(false);
    expect(isStaticFile('/support/ticket/123')).toBe(false);
  });

  it('does not match unknown extensions', () => {
    expect(isStaticFile('/foo.html')).toBe(false);
    expect(isStaticFile('/foo.json')).toBe(false);
    expect(isStaticFile('/foo.txt')).toBe(false);
  });
});

describe('shouldBypassProxy', () => {
  function makeRequest(
    url: string,
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest(new URL(url, 'https://rvn.market'), {
      headers,
    });
  }

  it('bypasses static file requests', () => {
    expect(shouldBypassProxy(makeRequest('/favicon.ico'))).toBe(true);
    expect(shouldBypassProxy(makeRequest('/_next/static/x.js'))).toBe(true);
    expect(shouldBypassProxy(makeRequest('/images/logo.png'))).toBe(true);
  });

  it('bypasses /api/* routes (handled by their own auth/CSRF stack)', () => {
    expect(shouldBypassProxy(makeRequest('/api/trpc/foo'))).toBe(true);
    expect(shouldBypassProxy(makeRequest('/api/upload'))).toBe(true);
  });

  it('bypasses RSC payload requests (?_rsc=...)', () => {
    expect(shouldBypassProxy(makeRequest('/dashboard?_rsc=1'))).toBe(true);
  });

  it('bypasses requests from allowed search-engine bots', () => {
    expect(
      shouldBypassProxy(
        makeRequest('/', {
          'user-agent':
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        }),
      ),
    ).toBe(true);
  });

  it('does not bypass regular browser requests to app routes', () => {
    expect(
      shouldBypassProxy(
        makeRequest('/', {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }),
      ),
    ).toBe(false);
  });

  it('does not bypass app routes when user-agent header is missing', () => {
    expect(shouldBypassProxy(makeRequest('/dashboard'))).toBe(false);
  });
});
