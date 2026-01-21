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

  // Подозрительные паттерны автоматизированных инструментов
  const suspiciousPatterns = [
    /^$/, // Пустой
    /^[a-z]{1,3}$/i, // Слишком короткий
    /curl|wget|python|java|go-http|scrapy|httpie|postman|insomnia|rest-client/i, // Инструменты разработчика/скраперы
    /bot.*bot/i, // Двойное упоминание bot
    /^Mozilla\/4\.0$/, // Старый Mozilla без деталей
    /^Mozilla\/5\.0$/, // Только версия без деталей
    /^Mozilla\/5\.0\s*$/, // Только версия с пробелами
    /^python-requests|^go-http-client|^okhttp/i, // Известные HTTP клиенты
    /^$|^undefined$|^null$/i, // Невалидные значения
  ];

  // Проверка на отсутствие типичных браузерных маркеров
  const hasBrowserMarkers = /mozilla|chrome|safari|firefox|edge|opera/i.test(userAgent);
  if (!hasBrowserMarkers && userAgent.length > 0) {
    // Если нет браузерных маркеров, но есть UA - подозрительно
    return true;
  }

  return suspiciousPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Проверяет наличие важных заголовков браузера
 * Реальные браузеры всегда отправляют accept, accept-language и accept-encoding
 */
function hasMissingHeaders(headers: Record<string, string | null>): boolean {
  // Проверяем наличие важных заголовков браузера
  const importantHeaders = ['accept', 'accept-language', 'accept-encoding'];
  
  // Если отсутствуют 2 или более важных заголовка - подозрительно
  const missingCount = importantHeaders.filter(header => !headers[header] || headers[header]?.trim() === '').length;
  
  // Также проверяем качество заголовков
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

  // Проверяем на известные прокси/VPN паттерны (можно расширить)
  // Здесь можно добавить проверку через API или базу данных
  // Пока проверяем только формат
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
  
  return !ipv4Regex.test(ip) && !ipv6Regex.test(ip);
}

/**
 * Проверяет паттерны ботов (кроме разрешенных)
 */
function isBotPattern(userAgent: string): boolean {
  if (!userAgent) return true;

  // Разрешенные боты (Google, Yandex) - НЕ подозрительны
  const allowedBots = [
    /googlebot/i,
    /yandex/i,
    /bingbot/i,
    /slurp/i, // Yahoo
  ];

  // Если это разрешенный бот - не подозрительно
  if (allowedBots.some(pattern => pattern.test(userAgent))) {
    return false;
  }

  // Подозрительные паттерны ботов
  const botPatterns = [
    /bot|crawler|spider|scraper|fetcher|parser/i,
    /headless|phantom|selenium|webdriver|puppeteer|playwright/i,
    /http|curl|wget|python|java|go-http/i,
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Проверяет подозрительное поведение на основе заголовков и паттернов запроса
 */
function hasSuspiciousBehavior(headers: Record<string, string | null>, referer: string | null): boolean {
  const hasAccept = !!headers['accept'] && headers['accept']!.length > 0;
  const hasAcceptLanguage = !!headers['accept-language'] && headers['accept-language']!.length > 0;
  const hasAcceptEncoding = !!headers['accept-encoding'] && headers['accept-encoding']!.length > 0;

  // Если есть accept, но нет accept-language и accept-encoding - подозрительно
  // Реальные браузеры всегда отправляют все три заголовка вместе
  if (hasAccept && !hasAcceptLanguage && !hasAcceptEncoding) {
    return true;
  }

  // Подозрительный Accept header (не браузерный)
  // Браузеры обычно запрашивают HTML, CSS, JS, изображения
  if (headers['accept']) {
    const acceptValue = headers['accept'].toLowerCase();
    const hasBrowserAccept = /text\/html|application\/xhtml|image|text\/css|application\/javascript|application\/json|text\/plain/i.test(acceptValue);
    
    // Если accept не содержит типичных браузерных типов - подозрительно
    if (!hasBrowserAccept) {
      return true;
    }
    
    // Проверка на подозрительные паттерны в Accept
    if (/^\*\/\*$/.test(acceptValue.trim())) {
      // Accept: */* без специфики - подозрительно
      return true;
    }
  }

  // Проверка Accept-Language на валидность
  if (headers['accept-language']) {
    const langValue = headers['accept-language'].toLowerCase();
    // Валидный формат: en-US,en;q=0.9 или просто en
    if (!/^[a-z]{2}(-[a-z]{2})?(\s*,\s*[a-z]{2}(-[a-z]{2})?(\s*;\s*q\s*=\s*0\.\d+)?)*$/i.test(langValue)) {
      // Невалидный формат - подозрительно
      return true;
    }
  }

  // Проверка Accept-Encoding
  if (headers['accept-encoding']) {
    const encodingValue = headers['accept-encoding'].toLowerCase();
    // Браузеры обычно поддерживают gzip, deflate, br
    if (!/gzip|deflate|br|compress|identity/i.test(encodingValue)) {
      // Необычное кодирование - подозрительно
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
  // Веса факторов основаны на их важности для определения ботов
  let score = 0;

  if (factors.suspiciousUserAgent) score += 30; // Высокий вес - UA основной индикатор
  if (factors.missingHeaders) score += 20; // Средний вес - отсутствие заголовков подозрительно
  if (factors.suspiciousIP) score += 15; // Низкий вес - формат IP может быть валидным, но необычным
  if (factors.botPattern) score += 25; // Высокий вес - явные паттерны ботов
  if (factors.suspiciousBehavior) score += 10; // Низкий вес - поведенческие сигналы менее надежны

  factors.score = Math.min(score, 100);

  return factors;
}

/**
 * Проверяет, является ли посетитель разрешенным ботом (Google, Yandex)
 */
export function isAllowedBot(userAgent: string): boolean {
  if (!userAgent) return false;

  const allowedBots = [
    /googlebot/i,
    /yandex/i,
    /bingbot/i,
    /slurp/i, // Yahoo
  ];

  return allowedBots.some(pattern => pattern.test(userAgent));
}

/**
 * Определяет, нужно ли показывать страницу защиты
 * @param requestInfo - Информация о запросе
 * @param hasValidCookie - Есть ли валидная кука доступа
 * @returns true если нужно показать страницу защиты
 */
export function shouldShowProtection(
  requestInfo: RequestInfo,
  hasValidCookie: boolean
): boolean {
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

  // Если счет подозрительности выше порога - показываем защиту
  // Порог можно настроить (например, 30 = показывать только явно подозрительным)
  const SUSPICION_THRESHOLD = 30;

  return factors.score >= SUSPICION_THRESHOLD;
}
