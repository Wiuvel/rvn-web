import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
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
};

export default nextConfig;