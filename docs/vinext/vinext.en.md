# Vinext

> **[Русская версия](vinext.md)**

## Overview

The project runs on [**vinext**](https://github.com/cloudflare/vinext) — a reimplementation of the Next.js API surface on top of Vite. The CLI (`vinext dev`, `vinext build`, `vinext start`) and the whole `next/*` module set work as they did under Next.js; the App Router and `proxy.ts` likewise.

This document exists only because of **version 0.0.52 specifics**: it introduced regressions that 0.0.46 didn't have, and the workarounds for them live in this repo. If a future vinext bump removes one of the items below, the corresponding workaround can be dropped.

## Current workarounds (vinext 0.0.52)

### 1. Ambient module declarations for `next/*`

In 0.0.52 the `next` package is not pulled in, and `tsc` throws ~140 `TS2307: Cannot find module 'next/...'` errors. The vinext Vite plugin resolves `next/*` at runtime on its own, but TS doesn't know that.

**Where it's handled**: `types/global.d.ts` carries ambient module declarations that re-export from `vinext/shims/*` (the **officially exposed** npm subpath in vinext's `package.json`: `"./shims/*": { "types": "./dist/shims/*.d.ts", "import": "./dist/shims/*.js" }`):

```ts
declare module 'next/server' {
  export * from 'vinext/shims/server';
}
declare module 'next/headers' {
  export * from 'vinext/shims/headers';
}
// ...and so on for navigation, cache, link, image, script, dynamic, font/local, bare 'next'
```

**Why not tsconfig `paths`**: we tried — it breaks the build. Rolldown (via `vite-tsconfig-paths` in vinext) applies path mappings at runtime too, and `"next": [...]` (without `/*`) is treated as a **prefix match**: `next/server` then resolves to `<mapped>/server` and fails with `UNLOADABLE_DEPENDENCY`. Ambient declarations through `vinext/shims/*` solve the problem cleanly at the TS layer without touching the bundler.

### 2. `vitest.config.mts` — aliases for tests

Vitest uses Vite but without the vinext plugin. Tests importing `next/*` fail with `Failed to resolve import`. `vitest.config.mts` therefore carries:

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

Adding a new `next/*` import in a test? Add the matching alias.

### 3. Cookie `sameSite` — capitalized values

The vinext shim for `cookies()` requires `'Strict' | 'Lax' | 'None'`. Next.js (and vinext 0.0.46) accepted lowercase. Browsers (RFC 6265) are case-insensitive at runtime, so behaviour is identical — but **always use capitalized values in code**:

```ts
cookieStore.set('session_id', value, { sameSite: 'Strict' }); // ✅
```

### 4. `MetadataRoute` namespace is not exported

`MetadataRoute.Robots` / `MetadataRoute.Sitemap` are missing from the `next` shim. `app/robots.ts` and `app/sitemap.ts` carry no return-type annotation — TS infers it from the literal.

### 5. `next/image` shim: missing props

`draggable` and `fetchPriority` are absent from `ImageProps`. Fixed locally:

- `LogoLoader`: `fetchPriority` dropped (redundant — `priority` covers it).
- `ImageViewer`: `draggable={false}` moved to the parent via `onDragStart={e => e.preventDefault()}`.

Module augmentation for `next/image` via ambient declarations works (that's what item 1 uses), but **point-wise widening** of `ImageProps` doesn't: vinext's export is a default const, not a type, and `interface ImageProps {}` inside `declare module 'next/image'` doesn't merge with the shim's type.

### 6. CSS side-effect imports

Vinext doesn't declare `*.css` as a module. `types/global.d.ts` carries:

```ts
declare module '*.css';
```

## What vinext generates

- **`next-env.d.ts`** — rewritten on every `vinext dev` / `vinext build`. Gitignored.
- **`.next/types/routes.d.ts`** — globals `PageProps` / `LayoutProps` / `RouteContext`. The `.next/` directory is gitignored.

If either disappears, one `vinext build` restores it.

## Commands

```bash
vinext dev          # dev with HMR
vinext build        # production (RSC + SSR + client + standalone)
vinext start        # local production server
vinext check        # compatibility scanner
```

`vinext check` reports what vinext supports at **runtime**. It is **not** about TypeScript — that side is covered by item 1.

## Where to look when things break

| Symptom | Look here |
|---|---|
| `Cannot find module 'next/...'` from `tsc` | `types/global.d.ts` → `declare module 'next/...'` |
| `Failed to resolve import "next/..."` from `vitest` | `vitest.config.mts` → `resolve.alias` |
| `UNLOADABLE_DEPENDENCY ... shims/*/server` during build | Don't use tsconfig `paths` for `next/*` — move them into ambient declarations |
| `Type '"strict"' is not assignable to '"Strict" \| ...'` | Switch to capitalized |
| `Cannot find module... '*.css'` | `types/global.d.ts` |
| `PageProps` / `LayoutProps` are missing | `vinext build` regenerates `.next/types/routes.d.ts` |
