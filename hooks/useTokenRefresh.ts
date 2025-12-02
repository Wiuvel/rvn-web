'use client';

import { useEffect, useRef, useCallback } from 'react';

// ============================================================================
// Constants
// ============================================================================

// Refresh token 2 minutes before expiry (access token = 10 min)
const REFRESH_THRESHOLD_MS = 8 * 60 * 1000; // 8 minutes
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // Check every 2 minutes
const INITIAL_DELAY_MS = 5000; // Wait 5 seconds before first check

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for automatic proactive token refresh
 * Only refreshes when user is authenticated and token is about to expire
 */
export function useTokenRefresh() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);
  const isAuthenticatedRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const failureCountRef = useRef(0);

  // Refresh the token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) return false;

    try {
      isRefreshingRef.current = true;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        lastRefreshTimeRef.current = Date.now();
        failureCountRef.current = 0;
        isAuthenticatedRef.current = true;

        // Notify other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tokenRefreshed'));
        }

        return true;
      }

      // 401 means no valid refresh token
      if (response.status === 401) {
        failureCountRef.current++;
        isAuthenticatedRef.current = false;

        // Stop checking if not authenticated
        if (failureCountRef.current >= 2 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }

      return false;
    } catch {
      failureCountRef.current++;
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Check if we should refresh
  const checkAndRefresh = useCallback(async () => {
    // Skip if already refreshing or too many failures
    if (isRefreshingRef.current || failureCountRef.current >= 2) {
      return;
    }

    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTimeRef.current;

    // Refresh if threshold exceeded
    if (timeSinceLastRefresh >= REFRESH_THRESHOLD_MS) {
      await refreshToken();
    }
  }, [refreshToken]);

  useEffect(() => {
    // Handle auth success event (from useAuth)
    const handleAuthSuccess = () => {
      isAuthenticatedRef.current = true;
      failureCountRef.current = 0;
      lastRefreshTimeRef.current = Date.now();

      // Restart interval if stopped
      if (!intervalRef.current) {
        intervalRef.current = setInterval(checkAndRefresh, CHECK_INTERVAL_MS);
      }
    };

    // Handle token refreshed event
    const handleTokenRefreshed = () => {
      isAuthenticatedRef.current = true;
      failureCountRef.current = 0;
      lastRefreshTimeRef.current = Date.now();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('authSuccess', handleAuthSuccess);
      window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    }

    // Initial check after delay
    const initialTimer = setTimeout(() => {
      checkAndRefresh();
    }, INITIAL_DELAY_MS);

    // Regular interval
    intervalRef.current = setInterval(checkAndRefresh, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('authSuccess', handleAuthSuccess);
        window.removeEventListener('tokenRefreshed', handleTokenRefreshed);
      }
    };
  }, [checkAndRefresh]);
}
