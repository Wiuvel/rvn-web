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
          '/protection'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/_next/',
          '/admin/',
          '/ui/',
          '/error/',
          '/support/help',
          '/ui/panel/'
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/auth',
          '/legal/',
          '/protection'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/_next/',
          '/ui/',
          '/error/'
        ],
      },
      {
        userAgent: 'Bingbot',
        allow: [
          '/',
          '/auth',
          '/legal/',
          '/protection'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/protection/',
          '/_next/',
          '/ui/',
          '/error/'
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
