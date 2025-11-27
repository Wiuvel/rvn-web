import { Metadata } from 'next';

const baseUrl = 'https://rvn.market';
const siteName = 'Raven Private';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string[];
  url?: string;
  type?: 'website' | 'article' | 'profile';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  tags?: string[];
  noindex?: boolean; // Для запрета индексации
}

export function generateMetadata({
  title,
  description,
  keywords = [],
  url,
  type = 'website',
  publishedTime,
  modifiedTime,
  author,
  section,
  tags = [],
  noindex = false
}: SEOProps): Metadata {
  const fullTitle = title ? 
    (title.includes('Raven Private — безопасный доступ в сеть') ? title : `${title} | ${siteName}`) : 
    `${siteName} — безопасный доступ в сеть`;
  const fullDescription = description || 'RVN.MARKET — современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность. Стабильные сервера с минимальным пингом.';
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;

  const metadata: Metadata = {
    title: fullTitle,
    description: fullDescription,
    keywords: [
      'Raven Private',
      'RVN.MARKET',
      'VLESS',
      'PROXY',
      'прокси',
      'безопасность',
      'приватность',
      'анонимность',
      'защита данных',
      ...keywords
    ].join(', '),
    openGraph: {
      type,
      siteName,
      title: fullTitle,
      description: fullDescription,
      url: fullUrl,
      locale: 'ru_RU',
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
      ...(author && { authors: [author] }),
      ...(section && { section }),
      ...(tags.length > 0 && { tags })
    },
    twitter: {
      card: 'summary',
      title: fullTitle,
      description: fullDescription,
      creator: '@rvnprivate',
      site: '@rvnprivate'
    },
    robots: {
      index: !noindex,
      follow: !noindex,
      'max-snippet': noindex ? undefined : -1,
      'max-image-preview': noindex ? undefined : 'large',
      'max-video-preview': noindex ? undefined : -1,
    },
    alternates: {
      canonical: fullUrl,
    },
    verification: {
      google: 'your-google-verification-code',
      yandex: 'your-yandex-verification-code',
    },
    category: 'Technology',
    classification: 'VPN Service',
    other: {
      'mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'black-translucent',
      'apple-mobile-web-app-title': siteName,
      'application-name': siteName,
      'msapplication-TileColor': '#0f7fdb',
      'theme-color': '#0f7fdb',
    }
  };

  return metadata;
}

export const pageMetadata = {
  home: generateMetadata({
    title: 'Raven Private — безопасный доступ в сеть',
    description: 'RVN.MARKET — современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность. Стабильные сервера с минимальным пингом.',
    keywords: ['VPN', 'Proxy', 'безопасность', 'приватность', 'VLESS'],
    url: '/'
  }),

  auth: generateMetadata({
    title: 'Авторизация',
    description: 'Регистрация и вход в личный кабинет RVN.MARKET.',
    keywords: ['вход', 'регистрация', 'авторизация'],
    url: '/auth'
  }),

  dashboard: generateMetadata({
    title: 'Панель управления',
    description: 'Удобная панель управления для вашей подписки и настроек VLESS.',
    keywords: ['панель управления', 'профиль', 'аккаунт', 'настройки'],
    url: '/dashboard',
    noindex: true
  }),

  protection: generateMetadata({
    title: 'Проверка безопасности',
    description: 'Подтвердите, что вы человек, чтобы получить доступ к сайту Raven Private.',
    keywords: ['проверка', 'безопасность', 'captcha', 'защита'],
    url: '/protection',
    noindex: true
  }),

  legal: generateMetadata({
    title: 'Правовая информация',
    description: 'Соглашения и политики. Другие правовые документы Raven Private.',
    keywords: ['правовая информация', 'пользовательское соглашение', 'политика конфиденциальности'],
    url: '/legal'
  }),

  support: generateMetadata({
    title: 'Поддержка',
    description: 'Центр поддержки Raven Private. Создавайте тикеты, получайте помощь по вопросам использования сервиса, настройки VLESS и решения проблем.',
    keywords: ['поддержка', 'помощь', 'тикеты', 'обратная связь', 'контакты', 'техническая поддержка'],
    url: '/support'
  }),

  supportHelp: generateMetadata({
    title: 'Требуется авторизация',
    description: 'Для доступа к центру поддержки требуется авторизация. Войдите в аккаунт или обратитесь в Telegram.',
    keywords: ['авторизация', 'поддержка', 'вход'],
    url: '/support/help',
    noindex: true
  })
};

export function createArticleMetadata({
  title,
  description,
  publishedTime,
  modifiedTime,
  author = 'Raven Private',
  section = 'Новости',
  tags = [],
  url
}: {
  title: string;
  description: string;
  publishedTime: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  tags?: string[];
  url: string;
}) {
  return generateMetadata({
    title,
    description,
    publishedTime,
    modifiedTime: modifiedTime || new Date().toISOString(),
    author,
    section,
    tags,
    url,
    type: 'article'
  });
}
