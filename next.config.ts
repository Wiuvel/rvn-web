import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  assetPrefix: '',
  trailingSlash: false,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    '/lib/websocket/**/*': ['./lib/websocket/**/*'],
    '/lib/database/redis': ['./lib/database/redis.ts'],
    '/lib/wasm/pkg': ['./lib/wasm/pkg/*'],
  },
  serverExternalPackages: ['ioredis'],
  devIndicators: {
    position: 'top-right',
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes except static files
        // Exclude static file extensions to avoid HTTP/2 protocol errors
        source: '/:path((?!_next/static|static|favicon\\.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$|.*\\.woff$|.*\\.woff2$|.*\\.ttf$|.*\\.eot$|.*\\.css$|.*\\.js$|.*\\.map$).*)',
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
      // CORS headers for static files - minimal headers to avoid HTTP/2 errors
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
    ];
  },
};

export default nextConfig;