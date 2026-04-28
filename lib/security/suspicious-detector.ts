/**
 * Multi-factor visitor suspicion scoring (0-100).
 *
 * Factors: UA patterns, browser headers, IP format, bot signatures, behavioral signals.
 * Thresholds: >= 30 → /protection redirect, >= 80 → 403 block.
 * Rate limiting is handled separately in protection.ts.
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

const SUSPICIOUS_UA_PATTERNS = [
  /^$/,
  /^[a-z]{1,3}$/i,
  /curl|wget|python|java|go-http|scrapy|httpie|postman|insomnia|rest-client/i,
  /bot.*bot/i,
  /^Mozilla\/4\.0$/,
  /^Mozilla\/5\.0$/,
  /^Mozilla\/5\.0\s*$/,
  /^python-requests|^go-http-client|^okhttp/i,
  /^$|^undefined$|^null$/i,
];

const BROWSER_MARKERS = /mozilla|chrome|safari|firefox|edge|opera/i;

const ALLOWED_BOTS = [
  /googlebot/i,
  /yandex/i,
  /bingbot/i,
  /slurp/i,
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

/** Checks UA length, structure, browser markers, and known automation patterns. */
function isSuspiciousUserAgent(userAgent: string): boolean {
  if (!userAgent || userAgent.length < 10) return true;
  if (userAgent.length < 20) return true;

  const hasBrowserMarkers = BROWSER_MARKERS.test(userAgent);
  if (!hasBrowserMarkers && userAgent.length > 0) {
    if (isAllowedBot(userAgent)) return false;
    return true;
  }

  return SUSPICIOUS_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/** Real browsers always send accept, accept-language, accept-encoding. Missing 2+ is suspicious. */
function hasMissingHeaders(headers: Record<string, string | null>): boolean {
  const importantHeaders = ['accept', 'accept-language', 'accept-encoding'];

  const missingCount = importantHeaders.filter(
    (header) => !headers[header] || headers[header]?.trim() === '',
  ).length;

  const hasAccept = !!headers['accept'] && headers['accept']!.length > 0;
  const hasAcceptLanguage = !!headers['accept-language'] && headers['accept-language']!.length > 0;
  const hasAcceptEncoding = !!headers['accept-encoding'] && headers['accept-encoding']!.length > 0;

  if (!hasAccept && !hasAcceptLanguage && !hasAcceptEncoding) return true;

  return missingCount >= 2;
}

/** Flags IPs that don't match valid IPv4 or IPv6 format. */
function isSuspiciousIP(ip: string): boolean {
  if (!ip) return true;
  return !IPV4_REGEX.test(ip) && !IPV6_REGEX.test(ip);
}

/** Returns true for allowed crawlers (Google, Yandex, Bing, social previews). */
export function isAllowedBot(userAgent: string): boolean {
  if (!userAgent) return false;
  return ALLOWED_BOTS.some((pattern) => pattern.test(userAgent));
}

/** Detects bot/crawler/automation patterns in UA, excluding allowed bots. */
function isBotPattern(userAgent: string): boolean {
  if (!userAgent) return true;
  if (isAllowedBot(userAgent)) return false;
  return SUSPICIOUS_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

/** Validates header values against browser norms (accept types, language, encoding). */
function hasSuspiciousBehavior(
  headers: Record<string, string | null>,
  _referer: string | null,
): boolean {
  const hasAccept = !!headers['accept'] && headers['accept']!.length > 0;
  const hasAcceptLanguage = !!headers['accept-language'] && headers['accept-language']!.length > 0;
  const hasAcceptEncoding = !!headers['accept-encoding'] && headers['accept-encoding']!.length > 0;

  if (hasAccept && !hasAcceptLanguage && !hasAcceptEncoding) return true;

  if (headers['accept']) {
    const acceptValue = headers['accept'].toLowerCase();
    if (!BROWSER_ACCEPT_TYPES.test(acceptValue)) return true;
    if (/^\*\/\*$/.test(acceptValue.trim())) return true;
  }

  if (headers['accept-language']) {
    const langValue = headers['accept-language'].toLowerCase();
    if (!VALID_ACCEPT_LANGUAGE.test(langValue)) return true;
  }

  if (headers['accept-encoding']) {
    const encodingValue = headers['accept-encoding'].toLowerCase();
    if (!VALID_ACCEPT_ENCODING.test(encodingValue)) return true;
  }

  return false;
}

/**
 * Scores visitor suspicion (0-100) using weighted factors.
 *
 * UA: 30, headers: 20, IP: 15, bot pattern: 25, behavior: 10.
 */
export function detectSuspiciousVisitor(requestInfo: RequestInfo): SuspicionFactors {
  const { userAgent, ip, headers, referer } = requestInfo;

  const factors: SuspicionFactors = {
    suspiciousUserAgent: isSuspiciousUserAgent(userAgent),
    missingHeaders: hasMissingHeaders(headers),
    suspiciousIP: isSuspiciousIP(ip),
    highRequestRate: false,
    botPattern: isBotPattern(userAgent),
    suspiciousBehavior: hasSuspiciousBehavior(headers, referer),
    score: 0,
  };

  let score = 0;
  if (factors.suspiciousUserAgent) score += 30;
  if (factors.missingHeaders) score += 20;
  if (factors.suspiciousIP) score += 15;
  if (factors.botPattern) score += 25;
  if (factors.suspiciousBehavior) score += 10;
  factors.score = Math.min(score, 100);

  return factors;
}

/** Returns true if the visitor should see the protection page (score >= 30). */
export function shouldShowProtection(requestInfo: RequestInfo, hasValidCookie: boolean): boolean {
  if (hasValidCookie) return false;
  if (isAllowedBot(requestInfo.userAgent)) return false;

  const factors = detectSuspiciousVisitor(requestInfo);
  return factors.score >= 30;
}
