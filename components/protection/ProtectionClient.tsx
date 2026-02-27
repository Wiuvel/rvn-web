'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import Script from 'next/script';

interface ProtectionClientProps {
  initialIp: string | null;
}

export default function ProtectionClient({ initialIp }: ProtectionClientProps) {
  const [isIpRevealed, setIsIpRevealed] = useState(false);
  const ipAddress = initialIp;

  useEffect(() => {
    import('@/lib/scripts/protection')
      .then(() => {
        const initTurnstile = () => {
          if (typeof window === 'undefined') return;

          const win = window as TurnstileWindow;

          if (!win.turnstile || typeof win.turnstile.render !== 'function') {
            setTimeout(initTurnstile, 100);
            return;
          }

          const container = document.getElementById('turnstile-container');
          if (!container) {
            setTimeout(initTurnstile, 100);
            return;
          }

          container.innerHTML = '';

          const sitekey: string = '0x4AAAAAACDQkGbAxIWAKp08';
          const renderOptions: TurnstileRenderOptions = {
            sitekey: sitekey,
            theme: 'dark',
            size: 'flexible',
            callback: (token: string) => {
              if (typeof win.onSuccessCallback === 'function') {
                win.onSuccessCallback(token);
              }
            },
            'error-callback': () => {
              if (typeof win.onErrorCallback === 'function') {
                win.onErrorCallback();
              }
            },
            'before-interactive-callback': () => {
              if (typeof win.onBeforeInteractiveCallback === 'function') {
                win.onBeforeInteractiveCallback();
              }
            },
            'after-interactive-callback': () => {
              if (typeof win.onAfterInteractiveCallback === 'function') {
                win.onAfterInteractiveCallback();
              }
            },
            'unsupported-callback': () => {
              if (typeof win.onUnsupportedCallback === 'function') {
                win.onUnsupportedCallback();
              }
            },
          };

          try {
            win.turnstile.render(container, renderOptions);
          } catch (error) {
            console.error('Failed to render Turnstile:', error);
          }

          if (win.resetTitleFill) {
            win.resetTitleFill();
          }

          if (win.updateStatusText) {
            win.updateStatusText();
          }
        };

        setTimeout(initTurnstile, 100);
      })
      .catch((error) => {
        console.error('Failed to load protection script:', error);
      });
  }, []);

  const canReveal = Boolean(ipAddress) && !isIpRevealed;
  const isIpLoading = !ipAddress;

  const handleReveal = () => {
    if (canReveal) {
      setIsIpRevealed(true);
    }
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canReveal) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsIpRevealed(true);
    }
  };

  const ipDisplayText = ipAddress ?? 'Определяем…';

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="beforeInteractive"
        onError={(error) => {
          console.error('Failed to load Turnstile API:', error);
        }}
      />
      <div className="protection-page">
        <div className="center-container">
          {/* Site Title */}
          <div className="site-title" id="site-title-wrap">
            <span className="site-title-base" id="site-title-base">
              rvn.market
            </span>
            <span className="site-title-fill" id="site-title-fill">
              rvn.market
            </span>
          </div>
          {/* Site Description */}
          <div className="site-desc" id="site-desc" suppressHydrationWarning>
            Проверяем, человек ли вы. Это может занять несколько секунд.
          </div>
          {/* Cloudflare Turnstile - JS API */}
          <div id="turnstile-container" className="cf-turnstile" suppressHydrationWarning />
          {/* Footer */}
          <div className="footer" id="footer" suppressHydrationWarning></div>
        </div>
        {/* Cloudflare Badge */}
        <div
          className={`cloudflare-badge ${isIpLoading ? 'badge-loading' : ''}`}
          role="button"
          aria-disabled={!canReveal}
          tabIndex={canReveal ? 0 : -1}
          onClick={handleReveal}
          onKeyDown={handleCardKeyDown}
        >
          <span className="pulse" aria-hidden="true"></span>
          <span className="badge-text">
            Protected by{' '}
            <a
              href="https://www.cloudflare.com/products/turnstile/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloudflare
            </a>
          </span>
          <span className="badge-divider" aria-hidden="true">
            •
          </span>
          <span className={`badge-ip ${isIpLoading ? 'loading' : ''}`}>
            <span className="ip-label">IP:</span>
            {isIpLoading ? (
              <>
                <span className="ip-spinner" aria-hidden="true"></span>
                <span className="sr-only">Определяем IP…</span>
              </>
            ) : (
              <span className={`ip-value ${!isIpRevealed ? 'blurred' : ''}`} aria-live="polite">
                {ipDisplayText}
              </span>
            )}
          </span>
        </div>
      </div>
    </>
  );
}

interface TurnstileRenderOptions {
  sitekey: string;
  theme?: string;
  size?: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'before-interactive-callback'?: () => void;
  'after-interactive-callback'?: () => void;
  'unsupported-callback'?: () => void;
}

interface TurnstileWindow extends Window {
  turnstile?: {
    render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
    remove: (widgetId: string) => void;
  };
  onSuccessCallback?: (token: string) => void;
  onErrorCallback?: () => void;
  onBeforeInteractiveCallback?: () => void;
  onAfterInteractiveCallback?: () => void;
  onUnsupportedCallback?: () => void;
  checkExistingCookie?: () => boolean;
  resetTitleFill?: () => void;
  updateStatusText?: () => void;
}
