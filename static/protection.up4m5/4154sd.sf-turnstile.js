const captchaStates = {
    LOADING: 'loading',
    INTERACTIVE: 'interactive',
    VERIFYING: 'verifying',
    SUCCESS: 'success',
    ERROR: 'error'
};
let currentState = captchaStates.LOADING;

function syncTitleFill() {
    const fill = document.getElementById('site-title-fill');
    const base = document.getElementById('site-title-base');
    if (!fill || !base) return;
    if (parseFloat(fill.style.width) > 0 || fill.style.width === 'auto') {
        fill.style.width = base.offsetWidth + 'px';
    }
}

function setTitleFill(animate = true) {
    const fill = document.getElementById('site-title-fill');
    const base = document.getElementById('site-title-base');
    if (!fill || !base) return;
    
    if (animate) {
        fill.style.transition = 'width 1.1s cubic-bezier(.4,0,.2,1)';
        fill.style.width = base.offsetWidth + 'px';
    } else {
        fill.style.transition = 'none';
        fill.style.width = base.offsetWidth + 'px';
        setTimeout(() => { fill.style.transition = ''; }, 10);
    }
}

function resetTitleFill() {
    const fill = document.getElementById('site-title-fill');
    if (fill) fill.style.width = '0';
}

function animateTextChange(element, newText, color) {
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

function updateStatusText() {
    const desc = document.getElementById('site-desc');
    const footer = document.getElementById('footer');
    if (!desc) return;
    
    switch(currentState) {
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
            animateTextChange(desc, 'Проверка пройдена успешно.', '#b0b0b0');
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

function isValidBrowser() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const tests = {
        hasUserAgent: navigator.userAgent.length > 0,
        hasLanguages: navigator.languages && navigator.languages.length > 0,
        hasCookies: navigator.cookieEnabled,
        hasStorage: typeof Storage !== 'undefined',
        hasPerformance: typeof performance !== 'undefined',
    };

    if (isMobile) {
        console.log('[PROTECT] Mobile device detected. Using relaxed validation.');
        return Object.values(tests).every(test => test === true);
    }

    const desktopTests = {
        ...tests,
        hasPlugins: navigator.plugins && navigator.plugins.length > 0,
        hardwareConcurrency: navigator.hardwareConcurrency > 0,
        deviceMemory: navigator.deviceMemory > 0.25
    };

    console.log('[PROTECT] Desktop device. Using strict validation.');
    return Object.values(desktopTests).every(test => test === true);
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
    if (!isValidBrowser()) {
        console.log('[PROTECT] Browser validation failed. Not setting cookie.');
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

(function checkExistingCookie() {
    if (isSearchEngineBot()) {
        console.log('[PROTECT] Search engine bot detected. Skipping protection.');
        return;
    }

    if (!isValidBrowser()) {
        console.log('[PROTECT] Invalid browser detected. Requiring verification.');
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

window.addEventListener('resize', syncTitleFill);