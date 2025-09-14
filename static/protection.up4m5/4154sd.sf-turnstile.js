const captchaStates = {
    LOADING: 'loading',
    INTERACTIVE: 'interactive',
    VERIFYING: 'verifying',
    SUCCESS: 'success',
    ERROR: 'error'
};
let currentState = captchaStates.LOADING;

function isValidBrowser() {
    const tests = {
        hasUserAgent: navigator.userAgent.length > 0,
        hasLanguages: navigator.languages && navigator.languages.length > 0,
        hasPlugins: navigator.plugins && navigator.plugins.length > 0,
        hasCookies: navigator.cookieEnabled,
        hasStorage: typeof Storage !== 'undefined',
        hasPerformance: typeof performance !== 'undefined',
        hardwareConcurrency: navigator.hardwareConcurrency > 1,
        deviceMemory: navigator.deviceMemory > 0.5
    };

    return Object.values(tests).every(test => test === true);
}

function isSearchEngineBot() {
    const botPatterns = [
        /googlebot/i, /bingbot/i, /yandex/i, /duckduckbot/i,
        /baiduspider/i, /slurp/i, /facebookexternalhit/i,
        /twitterbot/i, /linkedinbot/i, /whatsapp/i, /telegrambot/i
    ];
    
    return botPatterns.some(pattern => pattern.test(navigator.userAgent));
}

(function checkExistingCookie() {
    if (isSearchEngineBot()) {
        console.log('Search engine bot detected. Skipping protection.');
        return;
    }

    if (!isValidBrowser()) {
        console.log('Invalid browser detected Requiring verification.');
        return;
    }
    
    if (document.cookie.includes('access_granted=true')) {
        const urlParams = new URLSearchParams(window.location.search);
        let redirectUrl = (urlParams.get('redirect') || '/').trim();
        if (redirectUrl.startsWith('/') && !redirectUrl.startsWith('//') && !redirectUrl.includes('://')) {
            window.location.replace(redirectUrl);
            return;
        }
    }
})();

function onSuccessCallback(token) {
    if (!isValidBrowser()) {
        console.log('Browser validation failed. Not setting cookie.');
        currentState = captchaStates.ERROR;
        updateStatusText();
        return;
    }
    
    currentState = captchaStates.SUCCESS;
    updateStatusText();
    const expiration = new Date();
    expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000));
    const browserFingerprint = generateBrowserFingerprint();
    document.cookie = `access_granted=true; fingerprint=${browserFingerprint}; expires=${expiration.toUTCString()}; path=/; domain=.rvn.guru; Secure; SameSite=Strict`;
    const urlParams = new URLSearchParams(window.location.search);
    let redirectUrl = (urlParams.get('redirect') || '/').trim();
    
    if (!redirectUrl.startsWith('/') || redirectUrl.startsWith('//') || redirectUrl.includes('://')) {
        redirectUrl = '/';
    }

    setTimeout(() => {
        window.location.replace(redirectUrl);
    }, 1000);
}

function generateBrowserFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.languages ? navigator.languages.join(',') : '',
        screen.width + 'x' + screen.height,
        navigator.hardwareConcurrency || 'unknown'
    ];
    
    return btoa(components.join('|')).substring(0, 32);
}

function onBeforeInteractiveCallback() {
    if (!isValidBrowser()) {
        onUnsupportedCallback();
        return;
    }
    currentState = captchaStates.INTERACTIVE;
    updateStatusText();
}

function onAfterInteractiveCallback() {
    currentState = captchaStates.VERIFYING;
    updateStatusText();
}

function onUnsupportedCallback() {
    currentState = captchaStates.ERROR;
    updateStatusText();
}

function onSuccessCallback(token) {
    currentState = captchaStates.SUCCESS;
    updateStatusText();
    const expiration = new Date();
    expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000));
    document.cookie = `access_granted=true; expires=${expiration.toUTCString()}; path=/; domain=.rvn.guru; Secure; SameSite=Lax`;
    const urlParams = new URLSearchParams(window.location.search);
    let redirectUrl = (urlParams.get('redirect') || '/').trim();
    
    if (!redirectUrl.startsWith('/') || redirectUrl.startsWith('//') || redirectUrl.includes('://')) {
        redirectUrl = '/';
    }

    setTimeout(() => {
        window.location.replace(redirectUrl);
    }, 1000);
}

function onErrorCallback() {
    currentState = captchaStates.ERROR;
    updateStatusText();
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.style.display = 'block';
    }
}

function observeCaptchaContainer() {
    const container = document.querySelector('.cf-turnstile');
    if (!container) {
        setTimeout(observeCaptchaContainer, 100);
        return;
    }
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                const iframe = container.querySelector('iframe');
                if (iframe && currentState === captchaStates.LOADING) {
                    currentState = captchaStates.INTERACTIVE;
                    updateStatusText();
                }
            }
        });
    });
    
    observer.observe(container, {
        childList: true,
        subtree: true
    });
    
    setTimeout(() => {
        const iframe = container.querySelector('iframe');
        if (iframe && currentState === captchaStates.LOADING) {
            currentState = captchaStates.INTERACTIVE;
            updateStatusText();
        }
    }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    resetTitleFill();
    updateStatusText();
    observeCaptchaContainer();
    setTimeout(() => {
        if (!window.turnstile && currentState === captchaStates.LOADING) {
            currentState = captchaStates.ERROR;
            updateStatusText();
        }
    }, 10000);
});