# OAuth-провайдеры

> **[English version](oauth.en.md)**

## Обзор

Пять пользовательских OAuth-провайдеров (Google, Yandex, Twitch, VK, Telegram) и один админский (GitHub) встраиваются в общий поток логина и регистрации. Каждый провайдер живёт по пути `app/api/auth/oauth/<provider>/{route,callback/route}.ts` и в конце концов уходит в общие функции `createUserFromOAuth` / `getUserByEmail` из `lib/auth/index.ts`.

UI авторизации запускает OAuth во всплывающем окне через `app/auth/oauth-handler/page.tsx`, а родительский компонент `components/auth/Form.tsx` слушает `postMessage` от popup-окна. На случай, когда popup нельзя открыть (например, мобильный браузер), каждый callback поддерживает запасной путь — редирект напрямую на `/auth?error=…` или `/dashboard`.

```
[Форма авторизации / Form.tsx]
       │
       ▼
window.open('/api/auth/oauth/<provider>?popup=true', '_blank')
       │
       ▼
[GET /api/auth/oauth/<provider>]
  • генерируем CSRF state (32 случайных байта в hex)
  • кладём cookie oauth_state (10 минут, httpOnly)
  • редирект на authorization URL провайдера
       │
       ▼
[Логин и consent у провайдера]
       │
       ▼
[GET /api/auth/oauth/<provider>/callback]
  • сверка cookie oauth_state ↔ query state
  • обмен code на access token
  • запрос данных пользователя
  • createUserFromOAuth() или getUserByEmail()
  • SessionManager.registerDevice() + createSession()
  • выставляем cookie token + session_id + user_data
  • редирект на /auth/oauth-handler (popup) или /dashboard (full page)
       │
       ▼
[oauth-handler postMessage('success') → родитель → reload]
```

## Матрица провайдеров

| Провайдер | Поток | Token endpoint | User-info endpoint | Идентификатор | Примечания |
|-----------|-------|----------------|--------------------|---------------|------------|
| Google | OAuth 2.0 (`response_type=code`, scope `openid email profile`) | `https://oauth2.googleapis.com/token` | `https://www.googleapis.com/oauth2/v2/userinfo` | `email` | `prompt=consent`, `access_type=offline` |
| Yandex | OAuth 2.0 | `https://oauth.yandex.ru/token` | `https://login.yandex.ru/info` | `default_email` (или `emails[0]`) | Email верифицируется на стороне Yandex |
| Twitch | OAuth 2.0 | `https://id.twitch.tv/oauth2/token` | `https://api.twitch.tv/helix/users` | `email` | На запросе user-info нужен заголовок `Client-Id` |
| VK | OAuth 2.0 (legacy `vk.com/method/users.get`) | `https://oauth.vk.com/access_token` | `https://api.vk.com/method/users.get` | `email`, который VK возвращает в ответе на token | API version пиннится в запросе |
| Telegram | Telegram Login Widget (HMAC-подписанный query, без обмена токеном) | n/a | n/a | `id` (числовой Telegram ID) | Проверка hash через `secret_key = SHA-256(bot_token)` |
| GitHub (админский) | OAuth 2.0, ограничен коллабораторами `Wiuvel/rvn-web` | `https://github.com/login/oauth/access_token` | `https://api.github.com/user` | `login` сверяется с таблицей `trustedGithubDevelopers` | Только под `app/api/admin/oauth/github` |

## CSRF: cookie `oauth_state`

Каждый initiation-роут генерирует `state = randomBytes(32).toString('hex')` и кладёт его в httpOnly-cookie:

```ts
response.cookies.set('oauth_state', stateWithPopup, {
  maxAge: 10 * 60,
  httpOnly: true,
  secure: !isLocalhost && production,
  sameSite: 'lax',
  path: '/',
});
```

Этот же `state` уезжает к провайдеру в query. На callback оба значения должны совпасть — иначе `getErrorRedirectUrl('invalid_state', …)`.

Если запрос пришёл из popup-страницы `/auth/oauth-handler`, к значению добавляется суффикс `:popup`, чтобы callback понял, куда редиректить пользователя. Перед сверкой суффикс отрезается.

## Popup vs. Full page

Один и тот же callback обслуживает оба варианта — отличается только конечный редирект.

| Поток | Когда срабатывает | Куда редиректим |
|-------|-------------------|-----------------|
| Popup | Форма открыла провайдера через `window.open(…, '_blank')`. Признак — `state` с суффиксом `:popup`, `referer` с `/auth/oauth-handler` или `?popup=true` в URL | `/auth/oauth-handler?error=<код>&popup=true` (или `?success=true`) |
| Full page | Провайдер был открыт в той же вкладке (мобильный fallback) | `/auth?error=<код>` или `/dashboard` |

Часть ошибок (`popup_blocked`, `popup_closed`, `popup_timeout`) всегда уходит на `/auth?error=…` независимо от исходного потока — см. `POPUP_SPECIFIC_ERRORS` в `lib/utils/oauth-errors.ts`.

## Проверка hash в Telegram

Telegram не реализует стандартный OAuth 2.0. Вместо этого Telegram Login Widget редиректит браузер на callback с параметрами `id`, `auth_date`, `hash` (и опционально `first_name`, `last_name`, `username`, `photo_url`) в query string.

Callback серверно проверяет целостность этих параметров:

```
secret_key      = SHA-256(bot_token)
data_check_str  = sorted("key=value\n…")  // алфавитная сортировка, без поля 'hash'
expected_hash   = HMAC-SHA-256(secret_key, data_check_str).hex()

if (expected_hash !== hash) → invalid_hash
if (now - auth_date > 24h)  → auth_expired
```

`bot_id` из `TELEGRAM_BOT_TOKEN` используется ещё и при initiation для построения URL виджета — см. `lib/utils/telegram-bot.ts`.

## Связывание аккаунтов

`createUserFromOAuth` из `lib/auth/index.ts` идемпотентна. Порядок поиска:

1. **По OAuth `provider_id`** (`google_<sub>`, `yandex_<id>`, `twitch_<id>`, `vk_<uid>`, `telegram_<id>`) — точное совпадение значит «возвратный пользователь».
2. **По email** для провайдеров, которые его отдают, — на первом входе привязываем новую OAuth-идентичность к существующему локальному аккаунту.
3. **Создать нового пользователя** — username берётся от провайдера (display name или sanitized local-part email), avatar URL копируется если есть, balance стартует с 0, дефолтная роль `user`.

У Telegram email отсутствует, поэтому шаг 2 пропускается — связать существующий аккаунт можно только если этот же Telegram ID уже привязан.

## Коды ошибок

Все коды ошибок (от провайдера и внутренние) нормализуются через `lib/utils/oauth-errors.ts` в короткие generic-строки (`oauth_denied`, `rate_limit`, `invalid_state`, `token_exchange_failed`, `no_email`, `account_disabled`, `popup_blocked`, …). Таблица сознательно сделана provider-agnostic, чтобы пользователь видел `Авторизация отменена` независимо от того, ошибся Google или Twitch.

Локализованные русские сообщения для каждого кода — в `OAUTH_ERROR_MESSAGES`. Особенности конкретных провайдеров (например, Google `access_denied` против `unauthorized_client`) транслируются через `GOOGLE_ERROR_MAP` перед поиском в таблице.

## Rate limiting

И initiation, и callback проходят через `authRateLimit.check(request)` — 10 запросов на IP за 5 минут (`appConfig.rateLimit.auth`, см. `lib/security/rate-limit.ts`). При срабатывании лимита пользователя редиректит на `/auth?error=rate_limit` (или popup-аналог), запрос к провайдеру вообще не уходит.

## Окружение

Каждый провайдер опционален: отсутствие credentials → редирект `oauth_not_configured`. Обязательные env-переменные (валидируются в `lib/validation/env-validation.ts`):

| Провайдер | Переменные |
|-----------|------------|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Yandex | `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET` |
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| VK | `VK_CLIENT_ID`, `VK_CLIENT_SECRET` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| GitHub (админский) | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ADMIN_ALLOWED_LOGINS` |

Redirect URI, зарегистрированные у каждого провайдера, должны указывать на `https://<NEXT_PUBLIC_DOMAIN>/api/auth/oauth/<provider>/callback`. Для локальной разработки добавьте в то же OAuth-приложение `http://localhost:3000/api/auth/oauth/<provider>/callback`.

## Файлы

- `app/api/auth/oauth/<provider>/route.ts` — initiation
- `app/api/auth/oauth/<provider>/callback/route.ts` — обмен токена + user-info
- `app/api/admin/oauth/github/{route,callback/route}.ts` — админский поток
- `app/auth/oauth-handler/page.tsx` — popup-handler (postMessage наверх)
- `lib/auth/index.ts` — `createUserFromOAuth`, `getUserByEmail`
- `lib/utils/oauth-errors.ts` — generic коды + RU-сообщения
- `lib/utils/telegram-bot.ts` — резолвер bot ID для URL виджета
