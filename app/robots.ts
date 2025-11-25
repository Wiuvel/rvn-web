import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://rvn.guru';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/auth',
          '/legal/'
        ],
        disallow: [
          '/api/',
          '/dashboard/',
          '/protection/',
          '/_next/',
          '/admin/',
          '/ui/',
          '/error/'
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: [
          '/',
          '/auth',
          '/legal/'
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
      {
        userAgent: 'Bingbot',
        allow: [
          '/',
          '/auth',
          '/legal/'
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
