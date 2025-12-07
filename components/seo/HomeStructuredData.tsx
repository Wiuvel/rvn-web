import StructuredData from './StructuredData';

export default function HomeStructuredData() {
  const organizationData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Raven Private',
    alternateName: 'RVN.MARKET',
    url: 'https://rvn.market',
    logo: 'https://rvn.market/logo.svg',
    description: 'RVN.MARKET — современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность.',
    sameAs: [
      'https://twitter.com/rvnprivate',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: ['Russian', 'English'],
    },
  };

  const websiteData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Raven Private',
    alternateName: 'RVN.MARKET',
    url: 'https://rvn.market',
    description: 'RVN.MARKET — современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность.',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://rvn.market/search?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const serviceData = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'VPN Service',
    provider: {
      '@type': 'Organization',
      name: 'Raven Private',
    },
    areaServed: 'Worldwide',
    description: 'Приватный доступ в сеть с использованием VLESS протокола. Высокая скорость, полная анонимность и защита данных.',
    offers: {
      '@type': 'Offer',
      priceCurrency: 'RUB',
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <>
      <StructuredData data={organizationData} id="structured-data-organization" />
      <StructuredData data={websiteData} id="structured-data-website" />
      <StructuredData data={serviceData} id="structured-data-service" />
    </>
  );
}

