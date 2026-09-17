'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Idiomatic hook to detect client-side mount using React 18+ useSyncExternalStore.
 * Returns `false` on the server and during initial hydration, and `true` on the client.
 * Does not cause extra renders or trigger ESLint/React Compiler set-state-in-effect warnings.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
