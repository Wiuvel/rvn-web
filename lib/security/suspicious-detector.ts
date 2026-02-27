/**
 * Умная система определения подозрительных посетителей
 * Анализирует различные факторы для выявления ботов, DDoS и подозрительной активности
 *
 * Система работает по принципу многоуровневой защиты:
 * 1. Анализ User-Agent на подозрительные паттерны
 * 2. Проверка наличия важных браузерных заголовков
 * 3. Валидация формата IP адреса
 * 4. Определение паттернов ботов и автоматизированных инструментов
 * 5. Анализ поведенческих сигналов (заголовки, referer)
 * 6. Rate limiting (выполняется отдельно в proxy.ts)
 *
 * Каждый фактор добавляет баллы к общему счету подозрительности (0-100).
 * Если счет >= порога (30), посетитель перенаправляется на страницу защиты.
 */

interface SuspicionFactors {
  suspiciousUserAgent: boolean;
  missingHeaders: boolean;
  suspiciousIP: boolean;
  highRequestRate: boolean;
  botPattern: boolean;
  suspiciousBehavior: boolean;
  score: number;
}

interface RequestInfo {
  userAgent: string;
  ip: string;
  headers: Record<string, string | null>;
  pathname: string;
  referer: string | null;
  acceptLanguage: string | null;
}

// Regex Constants for better performance
const SUSPICIOUS_UA_PATTERNS = [
  /^$/, // Empty
  /^[a-z]{1,3}$/i, // Too short
  /curl|wget|python|java|go-http|scrapy|httpie|postman|insomnia|rest-client/i, // Dev tools/scrapers
  /bot.*bot/i, // Double bot mention
  /^Mozilla\/4\.0$/, // Old Mozilla
  /^Mozilla\/5\.0$/, // Only version
  /^Mozilla\/5\.0\s*$/, // Only version with spaces
  /^python-requests|^go-http-client|^okhttp/i, // Known HTTP clients
  /^$|^undefined$|^null$/i, // Invalid values
];

const BROWSER_MARKERS = /mozilla|chrome|safari|firefox|edge|opera/i;

const ALLOWED_BOTS = [
  /googlebot/i,
  /yandex/i,
  /bingbot/i,
  /slurp/i, // Yahoo
  /twitterbot/i,
  /facebookexternalhit/i,
  /telegrambot/i,
  /discordbot/i,
  /whatsapp/i,
];

const SUSPICIOUS_BOT_PATTERNS = [
  /bot|crawler|spider|scraper|fetcher|parser/i,
  /headless|phantom|selenium|webdriver|puppeteer|playwright/i,
  /http|curl|wget|python|java|go-http/i,
];

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;

const BROWSER_ACCEPT_TYPES =
  /text\/html|application\/xhtml|image|text\/css|application\/javascript|application\/json|text\/plain/i;
const VALID_ACCEPT_LANGUAGE =
  /^[a-z]{2}(-[a-z]{2})?(\s*,\s*[a-z]{2}(-[a-z]{2})?(\s*;\s*q\s*=\s*0\.\d+)?)*$/i;
const VALID_ACCEPT_ENCODING = /gzip|deflate|br|compress|identity/i;

/**
 * Проверяет, является ли User-Agent подозрительным
 * Анализирует длину, структуру и известные паттерны автоматизированных инструментов
 */
function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent || userAgent.length < 10) {
    return true; // Слишком короткий или отсутствующий UA
  }

  // Нормальные браузеры обычно имеют UA длиной 50+ символов
  if (userAgent.length < 20) {
    return true;
  }

  // Проверка на отсутствие типичных браузерных маркеров
  const hasBrowserMarkers = BROWSER_MARKERS.test(userAgent);
  if (!hasBrowserMarkers && userAgent.length > 0) {
    // Если нет браузерных маркеров, но есть UA - подозрительно
    // Но сначала проверим, не бот ли это
    if (isAllowedBot(userAgent)) {
      return false;
    }
    return true;
  }

  return SUSPICIOUS_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Проверяет наличие важных заголовков браузера
 * Реальные браузеры всегда отправляют accept, accept-language и accept-encoding
 */
function hasMissingHeaders(headers: Record<string, string | null>): boolean {
  // Проверяем наличие важных заголовков браузера
  const importantHeaders = ['accept', 'accept-language', 'accept-encoding'];

  // Если отсутствуют 2 или более важных заголовка - подозрительно
  const missingCount = importantHeaders.filter(
    (header) => !headers[header] || headers[header]?.trim() === '',
  ).length;

  const hasAccept = !!headers['accept'] && headers['accept']!.length > 0;
  const hasAcceptLanguage = !!headers['accept-language'] && headers['accept-language']!.length > 0;
  const hasAcceptEncoding = !!headers['accept-encoding'] && headers['accept-encoding']!.length > 0;

  // Если отсутствуют все три - очень подозрительно
  if (!hasAccept && !hasAcceptLanguage && !hasAcceptEncoding) {
    return true;
  }

  return missingCount >= 2;
}

/**
 * Проверяет, является ли IP подозрительным
 */
function isSuspiciousIP(ip: string): boolean {
  if (!ip) return true;
  return !IPV4_REGEX.test(ip) && !IPV6_REGEX.test(ip);
}

/**
 * Проверяет, является ли посетитель разрешенным ботом (Google, Yandex и др.)
 */
export function isAllowedBot(userAgent: string): boolean {
  if (!userAgent) return false;
  return ALLOWED_BOTS.some((pattern) => pattern.test(userAgent));
}

/**
 * Проверяет паттерны ботов (кроме разрешенных)
 */
function isBotPattern(userAgent: string): boolean {
  if (!userAgent) return true;

  // Если это разрешенный бот - не подозрительно
  if (isAllowedBot(userAgent)) {
    return false;
  }

  return SUSPICIOUS_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/**
 * Проверяет подозрительное поведение на основе заголовков и паттернов запроса
 */
function hasSuspiciousBehavior(
  headers: Record<string, string | null>,
  referer: string | null,
): boolean {
  const hasAccept = !!headers['accept'] && headers['accept']!.length > 0;
  const hasAcceptLanguage = !!headers['accept-language'] && headers['accept-language']!.length > 0;
  const hasAcceptEncoding = !!headers['accept-encoding'] && headers['accept-encoding']!.length > 0;

  // Если есть accept, но нет accept-language и accept-encoding - подозрительно
  if (hasAccept && !hasAcceptLanguage && !hasAcceptEncoding) {
    return true;
  }

  // Подозрительный Accept header (не браузерный)
  if (headers['accept']) {
    const acceptValue = headers['accept'].toLowerCase();
    const hasBrowserAccept = BROWSER_ACCEPT_TYPES.test(acceptValue);

    // Если accept не содержит типичных браузерных типов - подозрительно
    if (!hasBrowserAccept) {
      return true;
    }

    // Проверка на подозрительные паттерны в Accept
    if (/^\*\/\*$/.test(acceptValue.trim())) {
      return true;
    }
  }

  // Проверка Accept-Language на валидность
  if (headers['accept-language']) {
    const langValue = headers['accept-language'].toLowerCase();
    if (!VALID_ACCEPT_LANGUAGE.test(langValue)) {
      return true;
    }
  }

  // Проверка Accept-Encoding
  if (headers['accept-encoding']) {
    const encodingValue = headers['accept-encoding'].toLowerCase();
    if (!VALID_ACCEPT_ENCODING.test(encodingValue)) {
      return true;
    }
  }

  return false;
}

/**
 * Определяет, является ли посетитель подозрительным
 * Использует многофакторный анализ для точного определения ботов и автоматизированных запросов
 *
 * @param requestInfo - Информация о запросе
 * @returns Объект с факторами подозрительности и общим счетом (0-100)
 */
export function detectSuspiciousVisitor(requestInfo: RequestInfo): SuspicionFactors {
  const { userAgent, ip, headers, referer } = requestInfo;

  const factors: SuspicionFactors = {
    suspiciousUserAgent: isSuspiciousUserAgent(userAgent),
    missingHeaders: hasMissingHeaders(headers),
    suspiciousIP: isSuspiciousIP(ip),
    highRequestRate: false, // Определяется отдельно через rate limiting в proxy.ts
    botPattern: isBotPattern(userAgent),
    suspiciousBehavior: hasSuspiciousBehavior(headers, referer),
    score: 0,
  };

  // Вычисляем общий счет подозрительности (0-100)
  let score = 0;

  if (factors.suspiciousUserAgent) score += 30;
  if (factors.missingHeaders) score += 20;
  if (factors.suspiciousIP) score += 15;
  if (factors.botPattern) score += 25;
  if (factors.suspiciousBehavior) score += 10;

  factors.score = Math.min(score, 100);

  return factors;
}

/**
 * Определяет, нужно ли показывать страницу защиты
 * @param requestInfo - Информация о запросе
 * @param hasValidCookie - Есть ли валидная кука доступа
 * @returns true если нужно показать страницу защиты
 */
export function shouldShowProtection(requestInfo: RequestInfo, hasValidCookie: boolean): boolean {
  // Если есть валидная кука - не показываем
  if (hasValidCookie) {
    return false;
  }

  // Разрешенные боты всегда обходят защиту
  if (isAllowedBot(requestInfo.userAgent)) {
    return false;
  }

  // Определяем подозрительность
  const factors = detectSuspiciousVisitor(requestInfo);

  // Порог подозрительности
  const SUSPICION_THRESHOLD = 30;

  return factors.score >= SUSPICION_THRESHOLD;
}
