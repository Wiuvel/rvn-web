const captchaStates = {
    LOADING: 'loading',
    INTERACTIVE: 'interactive',
    VERIFYING: 'verifying',
    SUCCESS: 'success',
    ERROR: 'error'
};

let currentState = captchaStates.LOADING;
let observationTimeout = null;
let mainTimeoutId = null;

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getTimeouts() {
    return isMobileDevice() ? {
        observeDelay: 500,
        iframeCheck: 8000,
        mainTimeout: 25000
    } : {
        observeDelay: 100,
        iframeCheck: 2000,
        mainTimeout: 15000
    };
}

const timeouts = getTimeouts();

async function generateSecureHash() {
    try {
        const data = navigator.userAgent + navigator.language + screen.width + 'x' + screen.height + 
                    (navigator.hardwareConcurrency || '') + (navigator.deviceMemory || '');
        
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex;
    } catch (error) {
        console.error('[HASH] Error generating secure hash:', error);
        return 'fallback_' + btoa(navigator.userAgent + Date.now()).substring(0, 64).replace(/[^a-f0-9]/g, '0');
    }
}

function safeRedirect(url) {
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
        console.error('[REDIRECT] Error during redirect:', error);
        window.location.replace('/');
        return true;
    }
}

function checkExistingCookie() {
    if (!isValidBrowser()) {
        console.log('[PROTECT] Invalid browser detected. Requiring verification.');
        return false;
    }
    
    if (window.location.pathname === '/protection') {
        console.log('[PROTECT] On protection page, skipping cookie check to avoid redirects.');
        return false;
    }
    
    const cookies = document.cookie.split(';');
    let hasAccess = false;
    let hasHash = false;
    let targetPath = null;
    
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

function observeCaptchaContainer() {
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
            if (mutation.type === 'childList' && container.querySelector('iframe') && currentState === captchaStates.LOADING) {
                currentState = captchaStates.INTERACTIVE;
                updateStatusText();
                observer.disconnect();
            }
        }
    });
    
    try {
        observer.observe(container, { childList: true, subtree: true });
    } catch (error) {
        console.error('[OBSERVER] Error observing container:', error);
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
    if (!navigator.userAgent || navigator.userAgent.length === 0) {
        console.log('[PROTECT] No User-Agent Detected.');
        return false;
    }
    
    if (!navigator.cookieEnabled) {
        console.log('[PROTECT] Cookies Are Disabled.');
        return false;
    }
    
    if (!window.JSON || !window.Promise) {
        console.log('[PROTECT] Browser lacks modern features.');
        return false;
    }
    
    return true;
}

async function setSecureCookie(token) {
    try {
        const expiration = new Date();
        expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000));
        const secureHash = await generateSecureHash();
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isVercel = hostname.includes('vercel.app');
        
        let domain = '';
        let secure = '';
        
        if (isLocalhost) {
            domain = '';
            secure = '';
        } else if (isVercel) {
            domain = '';
            secure = 'Secure';
        } else {
            domain = '.rvn.guru'; // production
            secure = 'Secure';
        }
        
        const cookieOptions = `expires=${expiration.toUTCString()}; path=/; ${domain ? `domain=${domain}; ` : ''}${secure}; SameSite=Strict`;
        
        document.cookie = `access_granted=true; ${cookieOptions}`;
        document.cookie = `access_hash=${secureHash}; ${cookieOptions}`;
        document.cookie = `access_time=${Date.now()}; ${cookieOptions}`;
        
        console.log('[COOKIE] Secure cookies set successfully for domain:', domain || hostname);
        return true;
    } catch (error) {
        console.error('[COOKIE] Error setting secure cookies:', error);
        return false;
    }
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

async function onSuccessCallback(token) {
    if (!isValidBrowser()) {
        console.log('[PROTECT] Browser validation failed. Not setting cookie.');
        currentState = captchaStates.ERROR;
        updateStatusText();
        return;
    }
    
    if (!await setSecureCookie(token)) {
        currentState = captchaStates.ERROR;
        updateStatusText();
        return;
    }
    
    currentState = captchaStates.SUCCESS;
    updateStatusText();
    
    const cookies = document.cookie.split(';');
    let targetPath = null;
    
    console.log('[PROTECT] All cookies:', document.cookie);
    
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        console.log('[PROTECT] Cookie:', name, '=', value);
        if (name === 'target_path' && value) {
            targetPath = decodeURIComponent(value);
            console.log('[PROTECT] Found target_path:', targetPath);
        }
    }
    
    let redirectUrl = '/';
    if (targetPath) {
        redirectUrl = targetPath;
        console.log('[PROTECT] Using target_path for redirect:', redirectUrl);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        redirectUrl = (urlParams.get('redirect') || '/').trim();
        console.log('[PROTECT] Using redirect parameter:', redirectUrl);
    }
    
    console.log('[PROTECT] Final redirect URL:', redirectUrl);
    
    setTimeout(() => {
        console.log('[PROTECT] Executing redirect to:', redirectUrl);
        safeRedirect(redirectUrl);
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

let resizeTimeout;
function debounceResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(syncTitleFill, 100);
}

document.addEventListener('DOMContentLoaded', () => {
    if (checkExistingCookie()) {
        return;
    }
    
    resetTitleFill();
    updateStatusText();
    observeCaptchaContainer();
    
    mainTimeoutId = setTimeout(() => {
        if (!window.turnstile && currentState === captchaStates.LOADING) {
            currentState = captchaStates.ERROR;
            updateStatusText();
        }
    }, timeouts.mainTimeout);
});

window.addEventListener('resize', debounceResize);
window.addEventListener('beforeunload', () => {
    if (observationTimeout) clearTimeout(observationTimeout);
    if (mainTimeoutId) clearTimeout(mainTimeoutId);
    if (resizeTimeout) clearTimeout(resizeTimeout);
});