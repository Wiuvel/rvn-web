'use client';

import { useEffect, useState, Suspense } from 'react';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';

function ProtectionPageContent() {
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const checkCookies = () => {
      const accessGranted = document.cookie
        .split('; ')
        .find(row => row.startsWith('access_granted='))
        ?.split('=')[1] === 'true';
      
      const accessHash = document.cookie
        .split('; ')
        .find(row => row.startsWith('access_hash='))
        ?.split('=')[1];

      if (accessGranted && accessHash) {
        console.log('Access cookies found, redirecting user');
        const redirectPath = searchParams.get('redirect') || '/';
        router.push(redirectPath);
        return;
      }
    };

    checkCookies();
  }, [isMounted, router, searchParams]);

  useEffect(() => {
    if (!isMounted) return;

    const script = document.createElement('script');
    script.src = '/static/protection.up4m5/sf-turnstile.js';
    script.defer = true;
    script.onload = () => {
      console.log('Protection script loaded successfully');
      setTimeout(() => {
        if (typeof window === 'undefined') return;

        const win = window as TurnstileWindow;

        if (win.turnstile) {
          console.log('Initializing Turnstile with JavaScript API.');
          const container = document.getElementById('turnstile-container');
          if (container) {
            container.innerHTML = '';
            const widgetId = win.turnstile.render(container, {
              sitekey: '0x4AAAAAAB0s4O-sxm9ZnAQk',
              theme: 'dark',
              size: 'flexible',
              callback: (token: string) => {
                console.log('Turnstile success:', token);
                if (typeof win.onSuccessCallback === 'function') {
                  win.onSuccessCallback(token);
                }
              },
              'error-callback': () => {
                console.log('Turnstile error');
                if (typeof win.onErrorCallback === 'function') {
                  win.onErrorCallback();
                }
              },
              'before-interactive-callback': () => {
                console.log('Turnstile before interactive');
                if (typeof win.onBeforeInteractiveCallback === 'function') {
                  win.onBeforeInteractiveCallback();
                }
              },
              'after-interactive-callback': () => {
                console.log('Turnstile after interactive');
                if (typeof win.onAfterInteractiveCallback === 'function') {
                  win.onAfterInteractiveCallback();
                }
              },
              'unsupported-callback': () => {
                console.log('Turnstile unsupported');
                if (typeof win.onUnsupportedCallback === 'function') {
                  win.onUnsupportedCallback();
                }
              }
            });
            
            console.log('Turnstile widget created with ID:', widgetId);
          }
        }
        
        console.log('Protection page loaded, checking for existing cookies.');
        
        if (win.resetTitleFill) {
          console.log('Calling resetTitleFill.');
          win.resetTitleFill();
        }
        
        if (win.updateStatusText) {
          console.log('Calling updateStatusText.');
          win.updateStatusText();
        }
        
        const siteTitleBase = document.getElementById('site-title-base');
        const siteTitleFill = document.getElementById('site-title-fill');
        const siteDesc = document.getElementById('site-desc');
        const footer = document.getElementById('footer');
        const turnstileContainer = document.querySelector('.cf-turnstile');
        console.log('DOM elements check:', {
          siteTitleBase: !!siteTitleBase,
          siteTitleFill: !!siteTitleFill,
          siteDesc: !!siteDesc,
          footer: !!footer,
          turnstileContainer: !!turnstileContainer
        });
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
        onLoad={() => {
          console.log('Turnstile API loaded successfully');
        }}
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

export default function ProtectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <ProtectionPageContent />
    </Suspense>
  );
}
