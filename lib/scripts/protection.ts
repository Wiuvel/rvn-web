/**
 * Protection script for /protection/ page
 */

type CaptchaState = 'loading' | 'interactive' | 'verifying' | 'success' | 'error';

interface Timeouts {
  observeDelay: number;
  iframeCheck: number;
  mainTimeout: number;
}

interface VerifyResponse {
  success: boolean;
  error?: string;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

interface WindowWithTurnstile extends Window {
  turnstile?: {
    render: (container: string | HTMLElement, options: unknown) => string;
    remove: (widgetId: string) => void;
  };
}

const captchaStates = {
  LOADING: 'loading' as CaptchaState,
  INTERACTIVE: 'interactive' as CaptchaState,
  VERIFYING: 'verifying' as CaptchaState,
  SUCCESS: 'success' as CaptchaState,
  ERROR: 'error' as CaptchaState,
};

let currentState: CaptchaState = captchaStates.LOADING;
let observationTimeout: ReturnType<typeof setTimeout> | null = null;
let mainTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Detects if the device is mobile
 */
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Gets timeout values based on device type
 */
function getTimeouts(): Timeouts {
  return isMobileDevice()
    ? {
        observeDelay: 500,
        iframeCheck: 8000,
        mainTimeout: 25000,
      }
    : {
        observeDelay: 100,
        iframeCheck: 3000,
        mainTimeout: 15000,
      };
}

const timeouts = getTimeouts();

/**
 * Generates a secure hash from browser fingerprint
 */
async function generateSecureHash(): Promise<string> {
  try {
    const data =
      navigator.userAgent +
      navigator.language +
      screen.width +
      'x' +
      screen.height +
      (navigator.hardwareConcurrency || '') +
      ((navigator as NavigatorWithDeviceMemory).deviceMemory || '');

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch {
    // Fallback hash generation on error
    return (
      'fallback_' +
      btoa(navigator.userAgent + Date.now())
        .substring(0, 64)
        .replace(/[^a-f0-9]/g, '0')
    );
  }
}

/**
 * Safely redirects to a URL with validation
 */
function safeRedirect(url: string): boolean {
  try {
    if (url && url.startsWith('/') && !url.startsWith('//') && !url.includes('://')) {
      if (!url.includes('<') && !url.includes('>') && !url.includes('javascript:')) {
        window.location.replace(url);
        return true;
      }
    }

    window.location.replace('/');
    return true;
  } catch (error) {
    console.error('%c[PROTECT] Critical: Redirect error', 'color: #a855f7; font-weight: bold;', error);
    window.location.replace('/');
    return true;
  }
}

/**
 * Checks if user already has valid protection cookies
 */
function checkExistingCookie(): boolean {
  if (!isValidBrowser()) {
    return false;
  }

  if (window.location.pathname === '/protection') {
    return false;
  }

  const cookies = document.cookie.split(';');
  let hasAccess = false;
  let hasHash = false;
  let targetPath: string | null = null;

  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'access_granted' && value === 'true') {
      hasAccess = true;
    }
    if (name === 'access_hash' && value && value.length === 64 && /^[a-f0-9]{64}$/.test(value)) {
      hasHash = true;
    }
    if (name === 'target_path' && value) {
      targetPath = decodeURIComponent(value);
    }
  }

  if (hasAccess && hasHash) {
    let redirectUrl = '/';
    if (targetPath) {
      redirectUrl = targetPath;
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      redirectUrl = (urlParams.get('redirect') || '/').trim();
    }
    return safeRedirect(redirectUrl);
  }

  return false;
}

/**
 * Observes the captcha container for iframe loading
 */
function observeCaptchaContainer(): void {
  if (observationTimeout) {
    clearTimeout(observationTimeout);
  }

  const container = document.querySelector('.cf-turnstile');
  if (!container) {
    observationTimeout = setTimeout(observeCaptchaContainer, timeouts.observeDelay);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'childList' &&
        container.querySelector('iframe') &&
        currentState === captchaStates.LOADING
      ) {
        currentState = captchaStates.INTERACTIVE;
        updateStatusText();
        observer.disconnect();
      }
    }
  });

  try {
    observer.observe(container, { childList: true, subtree: true });
  } catch {
    observationTimeout = setTimeout(observeCaptchaContainer, timeouts.observeDelay);
    return;
  }

  setTimeout(() => {
    if (container.querySelector('iframe') && currentState === captchaStates.LOADING) {
      currentState = captchaStates.INTERACTIVE;
      updateStatusText();
      observer.disconnect();
    }
  }, timeouts.iframeCheck);
}

/**
 * Syncs title fill width with base width
 */
function syncTitleFill(): void {
  const fill = document.getElementById('site-title-fill');
  const base = document.getElementById('site-title-base');
  if (!fill || !base) return;
  if (parseFloat(fill.style.width) > 0 || fill.style.width === 'auto') {
    fill.style.width = base.offsetWidth + 'px';
  }
}

/**
 * Sets title fill width with optional animation
 */
function setTitleFill(animate: boolean = true): void {
  const fill = document.getElementById('site-title-fill');
  const base = document.getElementById('site-title-base');
  if (!fill || !base) return;

  if (animate) {
    fill.style.transition = 'width 1.1s cubic-bezier(.4,0,.2,1)';
    fill.style.width = base.offsetWidth + 'px';
  } else {
    fill.style.transition = 'none';
    fill.style.width = base.offsetWidth + 'px';
    setTimeout(() => {
      fill.style.transition = '';
    }, 10);
  }
}

/**
 * Resets title fill width to 0
 */
function resetTitleFill(): void {
  const fill = document.getElementById('site-title-fill');
  if (fill) fill.style.width = '0';
}

/**
 * Animates text change with fade effect
 */
function animateTextChange(element: HTMLElement | null, newText: string, color?: string): void {
  if (!element) return;
  element.classList.add('fade-text');
  setTimeout(() => {
    if (typeof color !== 'undefined') element.style.color = color;
    element.textContent = newText;
    setTimeout(() => {
      element.classList.remove('fade-text');
    }, 20);
  }, 250);
}

/**
 * Updates status text based on current state
 */
function updateStatusText(): void {
  const desc = document.getElementById('site-desc');
  const footer = document.getElementById('footer');
  if (!desc) return;

  switch (currentState) {
    case captchaStates.LOADING:
      animateTextChange(desc, 'Проверяем, человек ли вы. Это может занять несколько секунд.', '#b0b0b0');
      if (footer) animateTextChange(footer, '', '#888');
      resetTitleFill();
      break;
    case captchaStates.INTERACTIVE:
      animateTextChange(desc, 'Подтвердите, что вы человек, выполнив указанное действие ниже:', '#b0b0b0');
      if (footer) animateTextChange(footer, 'Выполните проверку безопасности', '#888');
      setTitleFill();
      break;
    case captchaStates.VERIFYING:
      animateTextChange(desc, 'Проверка выполняется..', '#b0b0b0');
      if (footer) animateTextChange(footer, '', '#888');
      break;
    case captchaStates.SUCCESS:
      animateTextChange(desc, 'Проверка пройдена успешно.', '#5bd1a9');
      if (footer) animateTextChange(footer, 'Выполняется перенаправление на сайт..', '#888');
      setTitleFill();
      break;
    case captchaStates.ERROR:
      animateTextChange(desc, 'Ошибка проверки безопасности. Обновите страницу или попробуйте позже.', '#ff6b6b');
      if (footer) animateTextChange(footer, '', '#888');
      resetTitleFill();
      break;
  }
}

/**
 * Validates browser capabilities
 */
function isValidBrowser(): boolean {
  if (!navigator.userAgent || navigator.userAgent.length === 0) {
    return false;
  }

  if (!navigator.cookieEnabled) {
    return false;
  }

  if (!window.JSON || !window.Promise) {
    return false;
  }

  return true;
}

/**
 * Sets secure cookies after successful verification
 */
async function setSecureCookie(): Promise<boolean> {
  try {
    const expiration = new Date();
    expiration.setTime(expiration.getTime() + 2 * 60 * 60 * 1000);
    const secureHash = await generateSecureHash();
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    let domain = '';
    let secure = '';

    if (isLocalhost) {
      domain = '';
      secure = '';
    } else {
      domain = '.rvn.market';
      secure = 'Secure';
    }

    const cookieOptions = `expires=${expiration.toUTCString()}; path=/; ${domain ? `domain=${domain}; ` : ''}${secure}; SameSite=Strict`;

    document.cookie = `access_granted=true; ${cookieOptions}`;
    document.cookie = `access_hash=${secureHash}; ${cookieOptions}`;
    document.cookie = `access_time=${Date.now()}; ${cookieOptions}`;

    return true;
  } catch (error) {
    console.error('%c[PROTECT] Critical: Cookie initialization failed', 'color: #a855f7; font-weight: bold;', error);
    return false;
  }
}

/**
 * Callback before captcha becomes interactive
 */
function onBeforeInteractiveCallback(): void {
  if (!isValidBrowser()) {
    onUnsupportedCallback();
    return;
  }
  currentState = captchaStates.INTERACTIVE;
  updateStatusText();
}

/**
 * Callback after captcha becomes interactive
 */
function onAfterInteractiveCallback(): void {
  currentState = captchaStates.VERIFYING;
  updateStatusText();
}

/**
 * Callback for unsupported browsers
 */
function onUnsupportedCallback(): void {
  currentState = captchaStates.ERROR;
  updateStatusText();
}

/**
 * Callback on successful captcha verification
 */
async function onSuccessCallback(token: string): Promise<void> {
  if (!isValidBrowser()) {
    currentState = captchaStates.ERROR;
    updateStatusText();
    return;
  }

  // Проверяем токен на сервере перед установкой cookie
  currentState = captchaStates.VERIFYING;
  updateStatusText();

  try {
    const verifyResponse = await fetch('/api/protection/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ captchaToken: token }),
    });

    const verifyData: VerifyResponse = await verifyResponse.json();

    if (!verifyResponse.ok || !verifyData.success) {
      console.error('%c[PROTECT] Critical: Token verification failed', 'color: #a855f7; font-weight: bold;', verifyData.error || 'Unknown error');
      currentState = captchaStates.ERROR;
      updateStatusText();
      return;
    }

    // Токен проверен успешно, устанавливаем cookie
    if (!(await setSecureCookie())) {
      currentState = captchaStates.ERROR;
      updateStatusText();
      return;
    }

    currentState = captchaStates.SUCCESS;
    updateStatusText();

    const cookies = document.cookie.split(';');
    let targetPath: string | null = null;

    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'target_path' && value) {
        targetPath = decodeURIComponent(value);
      }
    }

    let redirectUrl = '/';
    if (targetPath) {
      redirectUrl = targetPath;
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      redirectUrl = (urlParams.get('redirect') || '/').trim();
    }

    setTimeout(() => {
      safeRedirect(redirectUrl);
    }, 1000);
  } catch (error) {
    console.error('%c[PROTECT] Critical: Token verification error', 'color: #a855f7; font-weight: bold;', error);
    currentState = captchaStates.ERROR;
    updateStatusText();
  }
}

/**
 * Callback on captcha error
 */
function onErrorCallback(): void {
  currentState = captchaStates.ERROR;
  updateStatusText();
  const errorDiv = document.getElementById('error');
  if (errorDiv) {
    errorDiv.style.display = 'block';
  }
}

let resizeTimeout: ReturnType<typeof setTimeout>;
function debounceResize(): void {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(syncTitleFill, 100);
}

/**
 * Initializes the protection script
 * Can be called manually or will auto-initialize on DOMContentLoaded
 */
function initializeProtection(): void {
  if (checkExistingCookie()) {
    return;
  }

  resetTitleFill();
  updateStatusText();
  observeCaptchaContainer();

  mainTimeoutId = setTimeout(() => {
    const win = window as WindowWithTurnstile;
    if (!win.turnstile && currentState === captchaStates.LOADING) {
      currentState = captchaStates.ERROR;
      updateStatusText();
    }
  }, timeouts.mainTimeout);
}

// Initialize on DOM ready if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeProtection);
} else {
  // DOM already loaded, initialize immediately
  initializeProtection();
}

window.addEventListener('resize', debounceResize);
window.addEventListener('beforeunload', () => {
  if (observationTimeout) clearTimeout(observationTimeout);
  if (mainTimeoutId) clearTimeout(mainTimeoutId);
  if (resizeTimeout) clearTimeout(resizeTimeout);
});

// Export initialization function for manual calls
export { initializeProtection };

// Export functions to window for use in protection page
interface ProtectionWindow extends Window {
  onSuccessCallback?: (token: string) => void;
  onErrorCallback?: () => void;
  onBeforeInteractiveCallback?: () => void;
  onAfterInteractiveCallback?: () => void;
  onUnsupportedCallback?: () => void;
  checkExistingCookie?: () => boolean;
  resetTitleFill?: () => void;
  updateStatusText?: () => void;
}

const win = window as ProtectionWindow;
win.onSuccessCallback = onSuccessCallback;
win.onErrorCallback = onErrorCallback;
win.onBeforeInteractiveCallback = onBeforeInteractiveCallback;
win.onAfterInteractiveCallback = onAfterInteractiveCallback;
win.onUnsupportedCallback = onUnsupportedCallback;
win.checkExistingCookie = checkExistingCookie;
win.resetTitleFill = resetTitleFill;
win.updateStatusText = updateStatusText;