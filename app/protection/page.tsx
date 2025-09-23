'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function ProtectionPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const script = document.createElement('script');
    script.src = '/static/protection.up4m5/sf-turnstile.js';
    script.defer = true;
        script.onload = () => {
          setTimeout(() => {
            if (typeof window === 'undefined') return;

            const win = window as TurnstileWindow;

            if (win.turnstile) {
              const container = document.getElementById('turnstile-container');
              if (container) {
                container.innerHTML = '';
                win.turnstile.render(container, {
                  sitekey: '0x4AAAAAAB0s4O-sxm9ZnAQk',
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
                  }
                });
              }
            }

            if (win.resetTitleFill) {
              win.resetTitleFill();
            }

            if (win.updateStatusText) {
              win.updateStatusText();
            }
          }, 100);
        };
    script.onerror = (error) => {
      console.error('Failed to load protection script:', error);
    };
    
    const existingScript = document.querySelector('script[src="/static/protection.up4m5/sf-turnstile.js"]');
    if (!existingScript) {
      document.head.appendChild(script);
    }

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [isMounted]);

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
            <span className="site-title-base" id="site-title-base">rvn.guru</span>
            <span className="site-title-fill" id="site-title-fill">rvn.guru</span>
          </div>
          {/* Site Description */}
          <div className="site-desc" id="site-desc" suppressHydrationWarning>
            Проверяем, человек ли вы. Это может занять несколько секунд.
          </div>
          {/* Cloudflare Turnstile - JS API */}
          {isMounted ? (
            <div 
              id="turnstile-container"
              className="cf-turnstile"  
              suppressHydrationWarning
            />
          ) : (
            <div className="cf-turnstile" suppressHydrationWarning></div>
          )}
          {/* Footer */}
          <div className="footer" id="footer" suppressHydrationWarning></div>
        </div>
        {/* Cloudflare Badge */}
        <div className="cloudflare-badge">
          <span className="pulse" aria-hidden="true"></span>
          <span>Protected by <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noopener noreferrer">Cloudflare</a></span>
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
    render: (
      container: string | HTMLElement,
      options: TurnstileRenderOptions
    ) => string;
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
