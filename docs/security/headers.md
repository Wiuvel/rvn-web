# Security-заголовки и CSP

> **[English version](headers.en.md)**

## Обзор

Security-заголовки выставляются на уровне прокси. Любой запрос проходит через `proxy.ts → handleProxy(...)` и финализируется вызовом `applySecurityHeaders(response, isStaticFile, request)` из `lib/security/headers.ts`. Используются два набора заголовков, в зависимости от ресурса:

- **Статические файлы** (под `/_next/static` и т.п.) — только минимальный CORS. CSP сюда не вешается, чтобы избежать HTTP/2 protocol errors, которые часть браузеров выкидывает на коллизиях CSP с content-type sniffing для `.svg` / `.woff2`.
- **Всё остальное** — полный CSP, HSTS (в production), `X-XSS-Protection`.

Замечание: топ-левел Next.js `middleware.ts` отсутствует. Прокси живёт в `proxy.ts` в корне репозитория и запускается через Edge runtime Next.js.

## Content-Security-Policy

Генерируется функцией `generateCSPHeader(isDev)` в `lib/security/headers.ts`. Заголовок ставится на каждый не-статический ответ:

```
default-src 'self' rvn.market *.rvn.market;
script-src 'self' 'unsafe-eval' 'unsafe-inline' rvn.market *.rvn.market https://challenges.cloudflare.com;
style-src 'self' 'unsafe-inline' rvn.market *.rvn.market;
img-src 'self' blob: data: rvn.market *.rvn.market *;
font-src 'self' rvn.market *.rvn.market;
connect-src 'self' https://challenges.cloudflare.com rvn.market *.rvn.market *;
frame-src 'self' https://challenges.cloudflare.com rvn.market *.rvn.market;
child-src 'self' https://challenges.cloudflare.com rvn.market *.rvn.market;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests;        // только в production
```

В development в директивы добавляются `localhost:* http://localhost:* ws://localhost:* wss://localhost:*`, а `upgrade-insecure-requests` отключается, чтобы HMR работал по plain HTTP.

### Разбор директив

| Директива | Значение | Зачем |
|-----------|----------|-------|
| `default-src` | `'self' rvn.market *.rvn.market` | Ограничиваем всё неуказанное явно регистрируемым доменом. |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline' …` + Cloudflare Turnstile | **Известное слабое место.** `'unsafe-eval'` сейчас нужен части кода (Next.js dev runtime, Recharts, шаблоны Drizzle SQL, попадающие в client bundle). `'unsafe-inline'` нужен, пока остаются inline `<style>`/`<script>` от сторонних библиотек (например, bootstrap Turnstile). Перевод на nonces/hashes — отдельная задача в backlog. |
| `style-src` | `'self' 'unsafe-inline' …` | `'unsafe-inline'` покрывает inlining preflight-ов Tailwind, инжектируемые GSAP стили и runtime-стили `next/font`. |
| `img-src` | `'self' blob: data: rvn.market *.rvn.market *` | `*` позволяет грузить аватарки из произвольных OAuth-провайдеров (Google, Yandex, Twitch, VK avatar URL). Без `*` аватарки на первом логине не отрисовались бы. `data:` нужен для inline-thumbhash-плейсхолдеров. |
| `connect-src` | `'self' Turnstile rvn.market *.rvn.market *` | Сужение этой директивы — один из пунктов security-бэклога. Wildcard есть, потому что часть кода делает outbound `fetch` к провайдерам прямо из браузера (например, прокси для profile-picture). |
| `frame-src` / `child-src` | `'self' Turnstile …` | Turnstile рендерится внутри iframe. Эмбед собственных поддоменов разрешён для iframe-based потоков. |
| `object-src` | `'none'` | Никаких legacy plugin-объектов. |
| `frame-ancestors` | `'none'` | Нас никуда не эмбедят; эквивалент `X-Frame-Options: DENY` (legacy-заголовок мы не выставляем). |
| `upgrade-insecure-requests` | только в production | Принудительный апгрейд HTTP→HTTPS, если в bundle случайно остался `http://`-URL. |

«Слабые» директивы (`'unsafe-eval'`, `'unsafe-inline'`, `connect-src *`, `img-src *`) задокументированы как технический долг. Они отслеживаются в `rvn-web-review.md` и общем security-бэклоге. Текущая роль CSP — defense in depth + enforcement frame-ancestors, а не полная защита от XSS.

## HSTS

Только в production:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

`max-age = 1 год`. `includeSubDomains` покрывает `*.rvn.market`. `preload` помечает домен для включения в browser preload-список (фактически мы туда ещё не подавали — для этого нужна валидация на hstspreload.org).

В development не выставляем, чтобы plain `http://localhost:3000` работал. На статике не выставляем из-за чувствительности к HTTP/2 (см. ниже).

## Прочие заголовки

- `X-XSS-Protection: 1; mode=block` — legacy; держим для старых браузеров, в современных Chromium/WebKit это no-op.
- `Access-Control-Allow-Origin` — контролируется `lib/security/cors.ts`. В production ограничен переменной `ALLOWED_ORIGINS`; в development зеркалит origin запроса. Статика разрешает same-origin и известные поддомены через `isValidOrigin()` / `isSubdomain()`.

Заголовка `X-Frame-Options` нет — современный эквивалент `frame-ancestors 'none'` в CSP уже включён, именно он и применяется. Глобального `X-Content-Type-Options: nosniff` тоже нет; для роутов работает встроенный content-type Next.js, плюс есть override `Content-Type: image/svg+xml` для статических `.svg` (выставляется в `applySecurityHeaders`, только если ещё не задан).

## Статика и HTTP/2

Ответы на статические файлы (`isStaticFile = true`) полностью пропускают security-заголовки:

```ts
if (isStaticFile) {
  // только CORS
  // опциональная проставка content-type для .svg
  return; // ни CSP, ни HSTS
}
```

Это обход HTTP/2 protocol errors, которые всплывают, когда CSP конфликтует с content-type sniffing на части CDN-конфигов. `_next/static` payload и так не исполняется в security-контексте (он content-addressed Next.js — хеши в имени файла), поэтому отсутствие там CSP допустимо.

## Валидация origin

`isValidOrigin(origin)` намеренно сделан мягким:

```ts
export function isValidOrigin(origin: string): boolean {
  return origin.includes(MAIN_DOMAIN);
}
```

Подстрочное совпадение по `MAIN_DOMAIN`. Это **известное слабое место**, описанное в security-ревью, — `https://evil-rvn.market.attacker.com` пройдёт. План — переход на `URL.hostname.endsWith('.' + MAIN_DOMAIN) || hostname === MAIN_DOMAIN`. Сейчас защита держится на upstream-прокси (Cloudflare), который ограничивает трафик до канонических доменов.

## Конфигурация

Большинство заголовков не настраивается рантаймом. Доступные env-переключатели:

| Переменная | Где используется | Эффект |
|------------|------------------|--------|
| `ALLOWED_ORIGINS` | `lib/security/cors.ts` | Comma-separated список разрешённых CORS-origin'ов в production. |
| `NEXT_PUBLIC_DOMAIN` | `appConfig.domains.main` | «Main domain» в CSP `default-src` / `*.<domain>`. Если не задано — fallback `'rvn.market'`. |
| `NODE_ENV` | `applySecurityHeaders` | Переключает HSTS и localhost-исключения CSP. |

Сам CSP редактируется только в коде — через `generateCSPHeader()`.

## Файлы

- `lib/security/headers.ts` — `generateCSPHeader`, `applySecurityHeaders`, `isValidOrigin`, `isSubdomain`.
- `lib/security/cors.ts` — `setCorsHeaders`, `handleCorsPreflight`.
- `proxy.ts` — точка входа прокси, обворачивает каждый ответ.
- `lib/proxy/auth.ts`, `lib/proxy/protection.ts` — также вызывают `applySecurityHeaders` на синтетических ответах (rate-limit denial, suspicion-блоки).
- `lib/utils/config.ts` → `appConfig.domains` — конфиг main / panel / api домена.
