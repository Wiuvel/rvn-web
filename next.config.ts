import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : '',
  trailingSlash: false,
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ['192.168.1.66'],
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-left',
  },
};

export default nextConfig;