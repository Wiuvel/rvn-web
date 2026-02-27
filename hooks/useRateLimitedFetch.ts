import { useState, useRef, useCallback } from 'react';

export function useRateLimitedFetch() {
  const [showRateLimitCaptcha, setShowRateLimitCaptcha] = useState(false);
  const isCaptchaOpenRef = useRef(false);
  const pendingRequestsQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingCaptchaRef = useRef(false);

  const fetchWithRateLimit = useCallback(
    async (
      url: string,
      options: RequestInit = {},
      retryCallback?: () => Promise<void>,
    ): Promise<Response> => {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Add callback to queue instead of overwriting - fixes race condition
        if (retryCallback) {
          pendingRequestsQueueRef.current.push(retryCallback);
        }

        // Open modal only if:
        // 1. Not already open
        // 2. Not processing captcha (prevents reopen loops)
        if (!isCaptchaOpenRef.current && !isProcessingCaptchaRef.current) {
          isCaptchaOpenRef.current = true;
          setShowRateLimitCaptcha(true);
        }
        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      return response;
    },
    [],
  );

  const handleRateLimitSuccess = useCallback(async () => {
    // Set processing flag - prevents reopen loops
    isProcessingCaptchaRef.current = true;

    // Close modal
    isCaptchaOpenRef.current = false;
    setShowRateLimitCaptcha(false);

    // Increase delay to ensure immunity is applied on server
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Process ALL requests in queue sequentially
    const queue = [...pendingRequestsQueueRef.current];
    pendingRequestsQueueRef.current = []; // Clear queue immediately

    for (const requestCallback of queue) {
      try {
        await requestCallback();
      } catch (error) {
        // If request hits rate limit again after immunity - critical error
        // DO NOT add back to queue and DO NOT show captcha again
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          // Rate limit still active - silent fail
        } else {
          // Error on retry - silent fail
        }
      }
    }

    // Reset processing flag only after queue is processed
    isProcessingCaptchaRef.current = false;
  }, []);

  const handleRateLimitClose = useCallback(() => {
    isCaptchaOpenRef.current = false;
    isProcessingCaptchaRef.current = false;
    setShowRateLimitCaptcha(false);
    pendingRequestsQueueRef.current = [];
  }, []);

  return {
    showRateLimitCaptcha,
    setShowRateLimitCaptcha,
    fetchWithRateLimit,
    handleRateLimitSuccess,
    handleRateLimitClose,
  };
}
