import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  trailingSlash: false,
  outputFileTracingRoot: process.cwd(),
  // Включаем файлы WebSocket в standalone сборку
  outputFileTracingIncludes: {
    '/lib/websocket/**/*': ['./lib/websocket/**/*'],
  },
  devIndicators: {
    position: 'top-right',
  },
};

export default nextConfig;