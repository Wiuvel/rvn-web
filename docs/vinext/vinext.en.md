# Vinext

> **[Русская версия](vinext.md)**

## Overview

The project runs on [**vinext**](https://github.com/cloudflare/vinext) (version `1.0.0-beta.10`) — a reimplementation of the Next.js API surface on top of Vite. The CLI (`vinext dev`, `vinext build`, `vinext start`) and the whole `next/*` module set work as they do under Next.js; the App Router and `proxy.ts` are fully supported.

In versions 0.0.52 — 0.1.2, vinext had a few typing and runtime regressions that required local workarounds in this repository. In **vinext 1.0.0-beta**, most of these issues were officially addressed by Cloudflare via the introduction of `@vinext/types`.

## Status of Workarounds (verified on vinext 1.0.0-beta.10)

### 1. Ambient module declarations for `next/*` — [CLOSED]

- **Previous state**: The `next` package was not installed, causing `tsc` to throw ~140 `TS2307: Cannot find module 'next/...'` errors without ambient declarations in `types/global.d.ts`.
- **Resolution**: Vinext 1.0.0-beta ships the official `@vinext/types` package and exposes the `vinext/types` subpath. The `next-env.d.ts` generator now automatically injects `import "vinext/types";`, providing complete `next/*` typing out of the box. The workaround in `types/global.d.ts` has been removed.

### 2. `vitest.config.mts` — aliases for tests — [ACTIVE]

Vitest runs on Vite directly without the `vinext()` Vite plugin (which is tuned for dev/build server workflows and the RSC pipeline). Tests importing `next/*` still require explicit aliases to vinext's shims:

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

When introducing new `next/*` imports into unit test suites, add the corresponding alias to `vitest.config.mts`.

### 3. Cookie `sameSite` casing — [CLOSED]

- **Previous state**: In 0.1.2, the `cookies()` shim strictly required capitalized values (`'Strict' | 'Lax' | 'None'`), conflicting with Next.js standard lowercase values.
- **Resolution**: In 1.0.0-beta, types and runtime parsing match Next.js conventions (`'strict' | 'lax' | 'none'`). All cookie calls across the codebase now use standard lowercase:

```ts
cookieStore.set('session_id', value, { sameSite: 'strict' });
```

### 4. `MetadataRoute` namespace — [CLOSED]

- **Previous state**: The `MetadataRoute` namespace was not exported from the `next` shim.
- **Resolution**: `@vinext/types` exports full Next.js types. `app/robots.ts` and `app/sitemap.ts` are now strictly typed with `MetadataRoute.Robots` and `MetadataRoute.Sitemap`.

### 5. `next/image` shim: props — [CLOSED]

- **Previous state**: `ImageProps` was missing properties such as `fetchPriority` and `draggable`.
- **Resolution**: Upstream `ImageProps` declarations in `@vinext/types` contain all standard Next.js and HTMLImageElement properties.

### 6. CSS side-effect imports — [CLOSED]

- **Previous state**: Vinext didn't declare `*.css` as a module, requiring `declare module '*.css'` in `types/global.d.ts`.
- **Resolution**: Module declarations for `*.css`, `*.svg`, `*.png`, etc. are now included in the upstream Next.js declarations bundled into `@vinext/types`.

---

## What vinext generates

- **`next-env.d.ts`** — rewritten on every `vinext dev` / `vinext build`. Includes `import "vinext/types";` and `./.next/types/routes.d.ts`. Gitignored.
- **`.next/types/routes.d.ts`** — global `PageProps`, `LayoutProps`, and `RouteContext`. The `.next/` directory is gitignored.

If either file is missing, running `pnpm run build` restores them.

## Commands

```bash
pnpm run dev          # dev server with HMR (127.0.0.1)
pnpm run build        # production build (RSC + SSR + client + standalone)
pnpm run start        # local standalone production server
pnpm run test run     # run Vitest unit tests once
pnpm run type:check   # check types via tsc --noEmit
pnpm run lint         # lint codebase via oxlint
```

## Where to look when things break

| Symptom | Look here |
|---|---|
| `Cannot find module 'next/...'` from `tsc` | Verify `import "vinext/types";` in `next-env.d.ts` (regenerate via `pnpm run build`) |
| `Failed to resolve import "next/..."` from `vitest` | `vitest.config.mts` → `resolve.alias` |
| `Type '"Strict"' is not assignable to '"strict" \| ...'` | Switch to lowercase (`strict`, `lax`, `none`) |
| `Property '...' does not exist on type '{...} \| null'` (`useParams`) | `useParams()` is nullable (like Next.js) — read via `?.` |
| `'pathname' is possibly 'null'` (`usePathname`) | `usePathname()` is nullable (like Next.js) — `usePathname() ?? ''` |
| `PageProps` / `LayoutProps` are missing | `pnpm run build` regenerates `.next/types/routes.d.ts` |
