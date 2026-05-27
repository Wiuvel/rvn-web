import type { NextConfig } from 'vinext';

const nextConfig: NextConfig = {
  cacheComponents: true,
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  assetPrefix: '',
  trailingSlash: false,
  outputFileTracingRoot: process.cwd(),
  devIndicators: {
    position: 'top-right',
  },
  async headers() {
    return [
      {
        /*
         * Baseline headers for `/api/*` — middleware doesn't run on API routes
         * (matcher excludes `api`), so we set them here. All other paths receive
         * the same headers via `applySecurityHeaders` in `lib/security/headers.ts`.
         */
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        /*
         * CORS headers for static files: /static/*, /_next/static/*, /favicon.ico.
         * Static assets bypass middleware, so CORS is set here directly.
         */
        source: '/:path((?:static(?:/.*)?|_next/static(?:/.*)?|favicon\\.ico))',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, HEAD, OPTIONS' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
