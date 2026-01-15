import type { NextConfig } from "next";

// CDN URL для статических файлов в продакшене
const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL || process.env.CDN_URL || 'https://cdn.rvn.market';

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  // Use CDN for static assets in production
  assetPrefix: process.env.NODE_ENV === 'production' ? CDN_URL : '',
  trailingSlash: false,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/lib/websocket/**/*': ['./lib/websocket/**/*'],
    '/lib/database/redis': ['./lib/database/redis.ts'],
  },
  serverExternalPackages: ['ioredis'],
  devIndicators: {
    position: 'top-right',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      // CORS headers for static files (CDN support)
      {
        source: '/favicon.ico',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, HEAD, OPTIONS',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, HEAD, OPTIONS',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, HEAD, OPTIONS',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;