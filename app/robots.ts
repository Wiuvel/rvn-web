import { MetadataRoute } from 'next';
import { domains } from '@/lib/utils/config';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = domains.mainUrl;

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/about',
          '/subscription',
          '/auth',
          '/legal/',
          '/support',
          '/sitemap.xml',
          '/robots.txt',
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/notifications/',
          '/protection/',
          '/user/settings/',
          '/ui/',
          '/_next/',
          '/error/',
          '/support/help',
          '/auth/oauth-handler',
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: ['/', '/about', '/subscription', '/auth', '/legal/', '/support', '/sitemap.xml'],
        disallow: [
          '/api/',
          '/dashboard/',
          '/notifications/',
          '/protection/',
          '/user/settings/',
          '/ui/',
          '/_next/',
          '/error/',
          '/auth/oauth-handler',
        ],
      },
      {
        userAgent: 'Bingbot',
        allow: ['/', '/about', '/subscription', '/auth', '/legal/', '/support', '/sitemap.xml'],
        disallow: [
          '/api/',
          '/dashboard/',
          '/notifications/',
          '/protection/',
          '/user/settings/',
          '/ui/',
          '/_next/',
          '/error/',
          '/auth/oauth-handler',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
