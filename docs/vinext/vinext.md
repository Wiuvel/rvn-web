# Vinext

> **[English version](vinext.en.md)**

## Обзор

Проект работает на [**vinext**](https://github.com/cloudflare/vinext) (версия `1.0.0-beta.10`) — реимплементации API Next.js поверх Vite. CLI (`vinext dev`, `vinext build`, `vinext start`) и весь набор `next/*` модулей работают как в Next.js, App Router и `proxy.ts` также поддерживаются.

В версиях 0.0.52 — 0.1.2 в vinext присутствовал ряд регрессий типизации и рантайма, требовавших локальных workaround'ов в проекте. В **vinext 1.0.0-beta** большинство этих проблем было официально решено Cloudflare через интеграцию `@vinext/types`.

## Статус workaround'ов (актуализировано для vinext 1.0.0-beta.10)

### 1. Ambient module declarations для `next/*` — [ЗАКРЫТ]

- **Было**: Пакет `next` не устанавливался, и `tsc` выдавал ошибки `TS2307: Cannot find module 'next/...'`. Требовались ручные ambient declarations в `types/global.d.ts`.
- **Решение**: Vinext 1.0.0-beta поставляет официальный пакет типов `@vinext/types` и экспортирует субпуть `vinext/types`. Генератор `next-env.d.ts` теперь автоматически добавляет `import "vinext/types";`, предоставляя TypeScript все типы `next/*` из коробки. Workaround в `types/global.d.ts` снят.

### 2. `vitest.config.mts` — алиасы для тестов — [АКТИВЕН]

Vitest запускается поверх Vite, но без плагина `vinext()` (так как плагин ориентирован на dev/build сервера и RSC-пайплайн). Тесты, импортирующие `next/*`, по-прежнему требуют явных алиасов на шимы:

```ts
resolve: {
  alias: {
    '@': path.resolve(import.meta.dirname, './'),
    'next/server': 'vinext/shims/server',
    'next/headers': 'vinext/shims/headers',
    'next/cache': 'vinext/shims/cache',
    'next/navigation': 'vinext/shims/navigation',
  },
}
```

При добавлении новых `next/*` импортов в unit-тестах соответствующий шим добавляется в `vitest.config.mts`.

### 3. Cookie `sameSite` casing — [ЗАКРЫТ]

- **Было**: В 0.1.2 шим `cookies()` строго требовал capitalized значения (`'Strict' | 'Lax' | 'None'`), ломая стандартные строчные литералы Next.js.
- **Решение**: В 1.0.0-beta типы синхронизированы со спецификацией Next.js (`'strict' | 'lax' | 'none'`). Все вызовы `cookieStore.set(...)` в кодовой базе приведены к стандартному lowercase:

```ts
cookieStore.set('session_id', value, { sameSite: 'strict' });
```

### 4. `MetadataRoute` namespace — [ЗАКРЫТ]

- **Было**: Пространство имен `MetadataRoute` не экспортировалось из шима `next`.
- **Решение**: `@vinext/types` включает полноценные типы Next.js. В `app/robots.ts` и `app/sitemap.ts` возвращаемые типы теперь строго аннотированы через `MetadataRoute.Robots` и `MetadataRoute.Sitemap`.

### 5. `next/image` shim: props — [ЗАКРЫТ]

- **Было**: В `ImageProps` отсутствовали свойства `fetchPriority` и `draggable`.
- **Решение**: `@vinext/types` предоставляет upstream-декларации `ImageProps`, включающие все стандартные атрибуты HTMLImageElement и Next.js.

### 6. CSS side-effect imports — [ЗАКРЫТ]

- **Было**: Vinext не объявлял модуль `*.css`, требовалась декларация `declare module '*.css'` в `types/global.d.ts`.
- **Решение**: Декларации `*.css`, `*.svg`, `*.png` и других ассетов теперь включены в глобальные типы upstream Next.js внутри `@vinext/types`.

---

## Что генерирует сам vinext

- **`next-env.d.ts`** — создается/обновляется при каждом `vinext dev` и `vinext build`. Включает `import "vinext/types";` и `./.next/types/routes.d.ts`. Находится в `.gitignore`.
- **`.next/types/routes.d.ts`** — глобальные `PageProps`, `LayoutProps`, `RouteContext`. Папка `.next/` находится в `.gitignore`.

Если эти файлы удалены — один вызов `pnpm run build` полностью восстанавливает их.

## Команды

```bash
pnpm run dev          # dev-сервер с HMR (127.0.0.1)
pnpm run build        # production-сборка (RSC + SSR + client + standalone)
pnpm run start        # запуск локального standalone production-сервера
pnpm run test run     # однократный прогон всех unit-тестов Vitest
pnpm run type:check   # проверка типов через tsc --noEmit
pnpm run lint         # линтинг проекта через oxlint
```

## Где смотреть когда сломалось

| Симптом | Куда |
|---|---|
| `Cannot find module 'next/...'` в `tsc` | Проверить наличие `import "vinext/types";` в `next-env.d.ts` (перегенерировать через `pnpm run build`) |
| `Failed to resolve import "next/..."` в `vitest` | `vitest.config.mts` → `resolve.alias` |
| `Type '"Strict"' is not assignable to '"strict" \| ...'` | Использовать стандартные lowercase значения (`strict`, `lax`, `none`) |
| `Property '...' does not exist on type '{...} \| null'` (`useParams`) | Шим `useParams()` nullable (как в Next.js) — читать через `?.` |
| `'pathname' is possibly 'null'` (`usePathname`) | Шим `usePathname()` nullable (как в Next.js) — `usePathname() ?? ''` |
| Пропали `PageProps` / `LayoutProps` | `pnpm run build` перегенерирует `.next/types/routes.d.ts` |
