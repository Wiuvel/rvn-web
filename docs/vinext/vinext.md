# Vinext

> **[English version](vinext.en.md)**

## Обзор

Проект работает на [**vinext**](https://github.com/cloudflare/vinext) — реимплементации API Next.js поверх Vite. CLI (`vinext dev`, `vinext build`, `vinext start`) и весь набор `next/*` модулей работают как раньше, App Router и `proxy.ts` тоже.

Документ нужен только из-за **специфики версии 0.0.52**: в ней появились regressions, которых не было в 0.0.46, и для них в проекте стоят локальные workaround'ы. Если бамп vinext'а уберёт пункт ниже — workaround можно снимать.

## Текущие workaround'ы (vinext 0.0.52)

### 1. Ambient module declarations для `next/*`

В 0.0.52 пакет `next` не подтягивается, и `tsc` валит ~140 ошибок `TS2307: Cannot find module 'next/...'`. Vinext-плагин для Vite сам резолвит `next/*` на runtime, но TS об этом не знает.

**Где решено**: `types/global.d.ts` — там лежат ambient module declarations, которые ре-экспортят содержимое из `vinext/shims/*` (это **официально exposed** npm subpath из `package.json` vinext'а: `"./shims/*": { "types": "./dist/shims/*.d.ts", "import": "./dist/shims/*.js" }`):

```ts
declare module 'next/server' {
  export * from 'vinext/shims/server';
}
declare module 'next/headers' {
  export * from 'vinext/shims/headers';
}
// ...и так для navigation, cache, link, image, script, dynamic, font/local, bare 'next'
```

**Почему не tsconfig `paths`**: пробовали — ломает build. Rolldown (через `vite-tsconfig-paths` в vinext) применяет path mappings и на runtime, причём `"next": [...]` (без `/*`) интерпретируется как **prefix-match**: импорт `next/server` начинает резолвиться в `<mapped>/server` и валится с `UNLOADABLE_DEPENDENCY`. Ambient declarations через `vinext/shims/*` решают проблему чисто на уровне TS, не затрагивая bundler.

### 2. `vitest.config.mts` — алиасы для тестов

Vitest использует Vite, но без vinext-плагина. Тесты, которые импортируют `next/*`, падают с `Failed to resolve import`. В `vitest.config.mts` стоят алиасы:

```ts
resolve: {
  alias: {
    'next/server': 'vinext/shims/server',
    'next/headers': 'vinext/shims/headers',
    'next/cache': 'vinext/shims/cache',
    'next/navigation': 'vinext/shims/navigation',
  },
}
```

Добавляешь новый `next/*` импорт в тесте — добавь алиас.

### 3. Cookie `sameSite` — capitalized values

Vinext-шим `cookies()` требует `'Strict' | 'Lax' | 'None'`. В Next.js (и в vinext 0.0.46) принимался lowercase. Браузеры RFC-6265 case-insensitive, рантайм идентичен, но **в коде используй capitalized**:

```ts
cookieStore.set('session_id', value, { sameSite: 'Strict' }); // ✅
```

### 4. `MetadataRoute` namespace не экспортируется

`MetadataRoute.Robots` / `MetadataRoute.Sitemap` отсутствуют в шиме `next`. В `app/robots.ts` и `app/sitemap.ts` тип возврата не аннотирован — TS выводит его из литерала.

### 5. `next/image` shim: отсутствующие props

`draggable` и `fetchPriority` отсутствуют в `ImageProps`. Решено точечно:

- `LogoLoader`: `fetchPriority` удалён (избыточен — `priority` его перекрывает).
- `ImageViewer`: `draggable={false}` перенесён на родителя через `onDragStart={e => e.preventDefault()}`.

Module augmentation для `next/image` через ambient declarations работает (используем именно его в пункте 1), но **точечное расширение** `ImageProps` — нет: vinext export — это default const, не type, и `interface ImageProps {}` внутри `declare module 'next/image'` не сливается с типом из шима.

### 6. CSS side-effect imports

Vinext не объявляет `*.css` как модуль. В `types/global.d.ts` стоит:

```ts
declare module '*.css';
```

## Что генерирует сам vinext

- **`next-env.d.ts`** — пишется при каждом `vinext dev` / `vinext build`. В `.gitignore`.
- **`.next/types/routes.d.ts`** — глобальные `PageProps` / `LayoutProps` / `RouteContext`. Папка `.next/` в `.gitignore`.

Если эти файлы пропали — запусти `vinext build` один раз, vinext их восстановит.

## Команды

```bash
vinext dev          # dev с HMR
vinext build        # production (RSC + SSR + client + standalone)
vinext start        # local production server
vinext check        # сканер совместимости
```

`vinext check` показывает что vinext поддерживает на runtime. Это **не про TypeScript** — TS-резолвинг описан в пункте 1.

## Где смотреть когда сломалось

| Симптом | Куда |
|---|---|
| `Cannot find module 'next/...'` в `tsc` | `types/global.d.ts` → `declare module 'next/...'` |
| `Failed to resolve import "next/..."` в `vitest` | `vitest.config.mts` → `resolve.alias` |
| `UNLOADABLE_DEPENDENCY ... shims/*/server` в build | Не используй tsconfig `paths` для `next/*` — переноси в ambient declarations |
| `Type '"strict"' is not assignable to '"Strict" \| ...'` | Замени на capitalized |
| `Cannot find module... '*.css'` | `types/global.d.ts` |
| Пропали `PageProps` / `LayoutProps` | `vinext build` перегенерит `.next/types/routes.d.ts` |
