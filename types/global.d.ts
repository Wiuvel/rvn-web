/**
 * Global types
 */

// Side-effect CSS imports (vinext doesn't ship a "next" package that would
// declare these for us, like Next.js used to via next-env.d.ts → next/types).
declare module '*.css';

// vinext 0.0.52 ships the Next.js public surface via `vinext/shims/*`, but the
// runtime/build (Vite + rolldown via vinext plugin) auto-resolves bare `next/*`
// imports. TypeScript however does NOT — there is no `next` package in
// node_modules. Earlier we wired tsconfig `paths` to map `next/*` → shim files,
// but that breaks the build: rolldown picks the `next` (no wildcard) mapping
// up as a prefix and tries to load `<mapped>/server` etc. The fix is to keep
// resolution entirely in TypeScript-land via ambient module declarations that
// re-export from `vinext/shims/*` (an officially supported export path).

declare module 'next' {
  export type { Metadata, Viewport } from 'vinext/shims/metadata';
}
declare module 'next/server' {
  export * from 'vinext/shims/server';
}
declare module 'next/headers' {
  export * from 'vinext/shims/headers';
}
declare module 'next/cache' {
  export * from 'vinext/shims/cache';
}
declare module 'next/navigation' {
  export * from 'vinext/shims/navigation';
}
declare module 'next/link' {
  export { default } from 'vinext/shims/link';
}
declare module 'next/image' {
  export { default } from 'vinext/shims/image';
  export type { StaticImageData } from 'vinext/shims/image';
}
declare module 'next/script' {
  export { default } from 'vinext/shims/script';
}
declare module 'next/dynamic' {
  export { default } from 'vinext/shims/dynamic';
}
declare module 'next/font/local' {
  export { default } from 'vinext/shims/font-local';
}
