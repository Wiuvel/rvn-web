'use client';

import useSWR, { SWRConfiguration, KeyedMutator } from 'swr';

type Fetcher<T> = (url: string) => Promise<T>;

/** Untyped API fetcher - use useApiSWR<T> for typed responses. */
export const apiFetcher: Fetcher<unknown> = async (url: string) => {
  const res = await fetch(url, {
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) {
        message = data.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  return res.json();
};

export function useApiSWR<T = unknown>(
  key: string | null,
  config?: SWRConfiguration<T>,
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
} {
  const { data, error, isLoading, mutate } = useSWR<T>(key, apiFetcher as Fetcher<T>, config);
  return { data, error, isLoading, mutate };
}
