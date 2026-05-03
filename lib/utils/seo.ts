import { Metadata } from 'next';
import { domains } from './config';

const baseUrl = domains.mainUrl;
const siteName = 'RVN';

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
  noindex?: boolean;
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
  noindex = false,
}: SEOProps): Metadata {
  const fullTitle = title
    ? title === siteName ||
      title.startsWith(`${siteName} `) ||
      title.includes('RVN - безопасный доступ в сеть')
      ? title
      : `${title} | ${siteName}`
    : `${siteName} - безопасный доступ в сеть`;
  const fullDescription =
    description ||
    'RVN.MARKET - современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность. Стабильные сервера с минимальным пингом.';
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;

  const metadata: Metadata = {
    title: fullTitle,
    description: fullDescription,
    keywords: ['RVN', 'rvn.market', 'Vless', 'Hysteria', 'Proxy', ...keywords].join(', '),
    openGraph: {
      type,
      siteName,
      title: fullTitle,
      description: fullDescription,
      url: fullUrl,
      locale: 'ru_RU',
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
      ...(author && { authors: [author] }),
      ...(section && { section }),
      ...(tags.length > 0 && { tags }),
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: fullDescription,
      site: '@rvnmarket',
      images: [`${baseUrl}/og-image.png`],
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
      google: 'Aw4Z8Ag_IMoxI8dQObubbiRdtKedpWyYYLdgW2og6Gg',
      yandex: '9fa13ce9cd4df963',
    },
    category: 'Technology',
    other: {
      'theme-color': '#0f7fdb',
    },
  };

  return metadata;
}

export const pageMetadata = {
  home: generateMetadata({
    title: 'RVN — Сервис приватного доступа в сеть',
    description:
      'RVN.MARKET - современный сервис приватного доступа в сеть. Высокая скорость и полная анонимность. Стабильные сервера с минимальным пингом.',
    keywords: ['Main Page', 'Home Page', 'Main'],
    url: '/',
  }),

  auth: generateMetadata({
    title: 'Авторизация',
    description: 'Регистрация и вход в личный кабинет RVN.',
    keywords: ['login', 'registration', 'authorization'],
    url: '/auth',
  }),

  dashboard: generateMetadata({
    title: 'Панель управления',
    description: 'Удобная панель управления для вашей подписки и настроек.',
    keywords: ['profile', 'account', 'settings'],
    url: '/dashboard',
    noindex: true,
  }),

  protection: generateMetadata({
    title: 'Проверка безопасности',
    description: 'Подтвердите, что вы человек, чтобы получить доступ к сайту RVN.',
    keywords: ['captcha'],
    url: '/protection',
    noindex: true,
  }),

  legal: generateMetadata({
    title: 'Правовая информация',
    description: 'Соглашения и политики. Другие правовые документы RVN.',
    keywords: ['legal information', 'user agreement', 'privacy policy'],
    url: '/legal',
  }),

  support: generateMetadata({
    title: 'Поддержка',
    description: 'Служба поддержки сервиса RVN.',
    keywords: ['support', 'technical support', 'help'],
    url: '/support',
  }),

  supportHelp: generateMetadata({
    title: 'Требуется авторизация',
    description:
      'Для доступа к центру поддержки требуется авторизация. Войдите в аккаунт или обратитесь в Telegram.',
    keywords: ['login', 'registration', 'authorization'],
    url: '/support/help',
    noindex: true,
  }),
};

export function createArticleMetadata({
  title,
  description,
  publishedTime,
  modifiedTime,
  author = 'RVN',
  section = 'Новости',
  tags = [],
  url,
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
    type: 'article',
  });
}
