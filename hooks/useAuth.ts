'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// Types
// ============================================================================

export interface UserData {
  id: string;
  user_id: string;
  username: string;
  dashboard_token: string;
  avatar_gradient?: string | null;
  created_at: string;
  last_login?: string | null;
  isSupport?: boolean;
  isAdmin?: boolean;
}

export interface UseAuthOptions {
  requireAuth?: boolean;
  redirectOnFail?: string;
  silent?: boolean;
  validateToken?: string;
  onSuccess?: (data: UserData) => void;
  onError?: (error: Error) => void;
}

export interface UseAuthReturn {
  userData: UserData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const FETCH_TIMEOUT = 10000;
const RETRY_DELAY = 1000;

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const {
    requireAuth = false,
    redirectOnFail,
    silent = false,
    validateToken,
    onSuccess,
    onError,
  } = options;

  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();

  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const fetchUserData = useCallback(async (isRetry = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch('/api/auth/me', {
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      if (!isMountedRef.current) return;

      // Handle 401 - try to refresh token
      if (response.status === 401) {
        const data = await response.json();

        // Token expired - try to refresh
        if (data.expired && !isRetry) {
          const refreshed = await tryRefreshToken();
          if (refreshed) {
            fetchingRef.current = false;
            await fetchUserData(true);
            return;
          }
        }

        // Not authenticated
        if (requireAuth && redirectOnFail) {
          router.push(redirectOnFail);
        }
        setUserData(null);
        setLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Handle success
      if (response.ok) {
        const data = await response.json();

        // Check if actually authenticated
        if (data.authenticated === false) {
          if (requireAuth && redirectOnFail) {
            router.push(redirectOnFail);
          }
          setUserData(null);
          setLoading(false);
          fetchingRef.current = false;
          return;
        }

        // Validate token if required
        if (validateToken && data.dashboard_token !== validateToken) {
          if (redirectOnFail) {
            router.push(redirectOnFail);
          }
          setUserData(null);
          setLoading(false);
          fetchingRef.current = false;
          return;
        }

        setUserData(data);
        setError(null);

        // Dispatch success event for other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('authSuccess'));
        }

        if (onSuccess) {
          onSuccess(data);
        }
      } else {
        // Other error
        if (requireAuth && redirectOnFail) {
          router.push(redirectOnFail);
        }
        setUserData(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      const error = err instanceof Error ? err : new Error('Unknown error');

      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        setError(new Error('Request timeout'));
      } else {
        setError(error);
      }

      if (onError && !silent) {
        onError(error);
      }

      if (requireAuth && redirectOnFail) {
        router.push(redirectOnFail);
      }

      setUserData(null);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  }, [requireAuth, redirectOnFail, silent, validateToken, onSuccess, onError, router]);

  // Try to refresh access token
  const tryRefreshToken = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tokenRefreshed'));
        }
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchUserData();

    // Listen for token refresh events
    const handleTokenRefreshed = () => {
      if (isMountedRef.current) {
        setTimeout(() => {
          fetchUserData();
        }, 100);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    }

    return () => {
      isMountedRef.current = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
      }
    };
  }, [fetchUserData]);

  return {
    userData,
    loading,
    error,
    refetch: fetchUserData,
  };
}
