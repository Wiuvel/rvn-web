import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://rvn.market';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/auth',
          '/legal/',
          '/support',
          '/sitemap.xml',
          '/robots.txt'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/protection/',
          '/_next/',
          '/admin/',
          '/ui/',
          '/error/',
          '/support/help',
          '/ui/panel/',
          '/auth/oauth-handler',
          '/ui/panel/admin/oauth-handler'
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/auth',
          '/legal/',
          '/support',
          '/sitemap.xml'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/protection/',
          '/_next/',
          '/ui/',
          '/error/',
          '/auth/oauth-handler',
          '/ui/panel/admin/oauth-handler'
        ],
      },
      {
        userAgent: 'Bingbot',
        allow: [
          '/',
          '/auth',
          '/legal/',
          '/support',
          '/sitemap.xml'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/protection/',
          '/_next/',
          '/ui/',
          '/error/',
          '/auth/oauth-handler',
          '/ui/panel/admin/oauth-handler'
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
