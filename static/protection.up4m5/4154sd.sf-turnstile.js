/**
 * Enhanced DDOS Protection Script
 * Refactored version with improved structure and performance
 * Maintains all original functionality
 */

// Configuration and state management
const captchaStates = {
    LOADING: 'loading',
    INTERACTIVE: 'interactive',
    VERIFYING: 'verifying',
    SUCCESS: 'success',
    ERROR: 'error'
};

// Global state
let currentState = captchaStates.LOADING;
let observationTimeout = null;
let mainTimeoutId = null;
let resizeTimeout = null;

// Performance monitoring
const PerformanceMonitor = {
    startTime: Date.now(),
    metrics: {
        loadTime: 0,
        turnstileLoadTime: 0,
        verificationTime: 0,
        errors: []
    },

    /**
     * Record performance metric
     */
    recordMetric(name, value) {
        this.metrics[name] = value;
        console.log(`[PERF] ${name}: ${value}ms`);
    },

    /**
     * Record error
     */
    recordError(error, context = '') {
        this.metrics.errors.push({
            error: error.message || error,
            context,
            timestamp: Date.now() - this.startTime
        });
        console.error(`[ERROR] ${context}:`, error);
    },

    /**
     * Get performance summary
     */
    getSummary() {
        return {
            ...this.metrics,
            totalTime: Date.now() - this.startTime,
            errorCount: this.metrics.errors.length
        };
    }
};

// Utility functions
const Utils = {
    /**
     * Check if device is mobile
     */
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    /**
     * Get timeout configuration based on device type
     */
    getTimeouts() {
        return this.isMobileDevice() ? {
            observeDelay: 500,
            iframeCheck: 8000,
            mainTimeout: 25000
        } : {
            observeDelay: 100,
            iframeCheck: 2000,
            mainTimeout: 15000
        };
    },

    /**
     * Debounce function for resize events
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Generate secure hash from browser fingerprint
     */
    async generateSecureHash() {
        try {
            const fingerprint = navigator.userAgent + 
                              navigator.language + 
                              screen.width + 'x' + screen.height + 
                              (navigator.hardwareConcurrency || '') + 
                              (navigator.deviceMemory || '');
            
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(fingerprint);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            
            return hashHex;
        } catch (error) {
            console.error('[HASH] Error generating secure hash:', error);
            return 'fallback_' + btoa(navigator.userAgent + Date.now()).substring(0, 64).replace(/[^a-f0-9]/g, '0');
        }
    },

    /**
     * Safely redirect to URL with validation
     */
    safeRedirect(url) {
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
    },

    /**
     * Validate browser capabilities
     */
    isValidBrowser() {
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
};

// Get timeout configuration
const timeouts = Utils.getTimeouts();

// Analytics and monitoring
const Analytics = {
    /**
     * Track user interaction
     */
    trackEvent(eventName, data = {}) {
        const event = {
            name: eventName,
            data: {
                ...data,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                state: currentState
            }
        };
        
        console.log(`[ANALYTICS] ${eventName}:`, event.data);
        
        // Send to analytics service (if configured)
        if (window.gtag) {
            gtag('event', eventName, event.data);
        }
        
        // Store locally for debugging
        if (!window.protectionAnalytics) {
            window.protectionAnalytics = [];
        }
        window.protectionAnalytics.push(event);
    },

    /**
     * Track performance metrics
     */
    trackPerformance() {
        const metrics = PerformanceMonitor.getSummary();
        this.trackEvent('performance_metrics', metrics);
    },

    /**
     * Track state changes
     */
    trackStateChange(fromState, toState) {
        this.trackEvent('state_change', {
            from: fromState,
            to: toState,
            duration: Date.now() - PerformanceMonitor.startTime
        });
    }
};

// Cookie management
const CookieManager = {
    /**
     * Check for existing valid cookies
     */
    checkExistingCookie() {
        if (!Utils.isValidBrowser()) {
            console.log('[PROTECT] Invalid browser detected. Requiring verification.');
            return false;
        }
        
        const cookies = document.cookie.split(';');
        let hasAccess = false;
        let hasHash = false;
        
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'access_granted' && value === 'true') {
                hasAccess = true;
            }
            if (name === 'access_hash' && value && value.length === 64 && /^[a-f0-9]{64}$/.test(value)) {
                hasHash = true;
            }
        }
        
        if (hasAccess && hasHash) {
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = (urlParams.get('redirect') || '/').trim();
            return Utils.safeRedirect(redirectUrl);
        }
        
        return false;
    },

    /**
     * Set secure cookies after successful verification
     */
    async setSecureCookie(token) {
        try {
            const expiration = new Date();
            expiration.setTime(expiration.getTime() + (2 * 60 * 60 * 1000)); // 2 hours
            const secureHash = await Utils.generateSecureHash();
            
            document.cookie = `access_granted=true; expires=${expiration.toUTCString()}; path=/; domain=.rvn.guru; Secure; SameSite=Strict`;
            document.cookie = `access_hash=${secureHash}; expires=${expiration.toUTCString()}; path=/; domain=.rvn.guru; Secure; SameSite=Strict`;
            document.cookie = `access_time=${Date.now()}; expires=${expiration.toUTCString()}; path=/; domain=.rvn.guru; Secure; SameSite=Strict`;
            
            console.log('[COOKIE] Secure cookies set successfully');
            return true;
        } catch (error) {
            console.error('[COOKIE] Error setting secure cookies:', error);
            return false;
        }
    }
};

// Title animation management
const TitleAnimation = {
    /**
     * Sync title fill with base width
     */
    syncTitleFill() {
        const fill = document.getElementById('site-title-fill');
        const base = document.getElementById('site-title-base');
        if (!fill || !base) return;
        
        // Force reflow to ensure elements are rendered
        fill.offsetWidth;
        
        if (parseFloat(fill.style.width) > 0 || fill.style.width === 'auto') {
            fill.style.width = base.offsetWidth + 'px';
        }
    },

    /**
     * Set title fill with optional animation
     */
    setTitleFill(animate = true) {
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
    },

    /**
     * Reset title fill to zero
     */
    resetTitleFill() {
        const fill = document.getElementById('site-title-fill');
        if (fill) fill.style.width = '0';
    }
};

// Retry and error handling
const RetryManager = {
    maxRetries: 3,
    retryCount: 0,
    retryDelay: 1000,

    /**
     * Execute function with retry logic
     */
    async executeWithRetry(fn, context = '') {
        try {
            return await fn();
        } catch (error) {
            PerformanceMonitor.recordError(error, context);
            
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.warn(`[RETRY] Attempt ${this.retryCount}/${this.maxRetries} for ${context}`);
                
                await this.delay(this.retryDelay * this.retryCount);
                return this.executeWithRetry(fn, context);
            } else {
                console.error(`[RETRY] Max retries exceeded for ${context}`);
                throw error;
            }
        }
    },

    /**
     * Delay execution
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Reset retry count
     */
    reset() {
        this.retryCount = 0;
    }
};

// UI management
const UIManager = {
    /**
     * Animate text change with fade effect
     */
    animateTextChange(element, newText, color) {
        if (!element) return;
        
        element.classList.add('fade-text');
        setTimeout(() => {
            if (typeof color !== 'undefined') {
                element.style.color = color;
            }
            element.textContent = newText;
            setTimeout(() => {
                element.classList.remove('fade-text');
            }, 20);
        }, 250);
    },

    /**
     * Update status text based on current state
     */
    updateStatusText() {
        const desc = document.getElementById('site-desc');
        const footer = document.getElementById('footer');
        if (!desc) return;
        
        switch(currentState) {
            case captchaStates.LOADING:
                this.animateTextChange(desc, 'Проверяем, человек ли вы. Это может занять несколько секунд.', '#b0b0b0');
                if (footer) this.animateTextChange(footer, '', '#888');
                TitleAnimation.resetTitleFill();
                break;
                
            case captchaStates.INTERACTIVE:
                this.animateTextChange(desc, 'Подтвердите, что вы человек, выполнив указанные действия ниже:', '#b0b0b0');
                if (footer) this.animateTextChange(footer, 'Выполните проверку безопасности', '#888');
                TitleAnimation.setTitleFill();
                break;
                
            case captchaStates.VERIFYING:
                this.animateTextChange(desc, 'Проверка выполняется..', '#b0b0b0');
                if (footer) this.animateTextChange(footer, '', '#888');
                break;
                
            case captchaStates.SUCCESS:
                this.animateTextChange(desc, 'Проверка пройдена успешно.', '#10b981');
                if (footer) this.animateTextChange(footer, 'Выполняется перенаправление на сайт..', '#888');
                TitleAnimation.setTitleFill();
                break;
                
            case captchaStates.ERROR:
                this.animateTextChange(desc, 'Ошибка проверки безопасности. Обновите страницу или попробуйте позже.', '#ff6b6b');
                if (footer) this.animateTextChange(footer, '', '#888');
                TitleAnimation.resetTitleFill();
                break;
        }
    }
};

// Enhanced security and validation
const SecurityManager = {
    /**
     * Enhanced browser fingerprinting
     */
    generateFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Browser fingerprint', 2, 2);
        
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            canvas: canvas.toDataURL(),
            hardware: navigator.hardwareConcurrency || 0,
            memory: navigator.deviceMemory || 0,
            touch: 'ontouchstart' in window,
            cookies: navigator.cookieEnabled
        };
    },

    /**
     * Validate Turnstile response
     */
    validateTurnstileResponse(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        
        // Basic token validation (Cloudflare tokens are typically 1000+ characters)
        if (token.length < 100) {
            return false;
        }
        
        // Check for common attack patterns
        const suspiciousPatterns = [
            /script/i,
            /javascript/i,
            /<[^>]*>/,
            /['"]/
        ];
        
        return !suspiciousPatterns.some(pattern => pattern.test(token));
    },

    /**
     * Rate limiting check
     */
    checkRateLimit() {
        const key = 'protection_attempts';
        const attempts = JSON.parse(localStorage.getItem(key) || '[]');
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        // Remove old attempts
        const recentAttempts = attempts.filter(time => now - time < oneHour);
        
        if (recentAttempts.length >= 10) {
            console.warn('[SECURITY] Rate limit exceeded');
            return false;
        }
        
        recentAttempts.push(now);
        localStorage.setItem(key, JSON.stringify(recentAttempts));
        return true;
    }
};

// Turnstile observer
const TurnstileObserver = {
    /**
     * Observe captcha container for iframe changes
     */
    observeCaptchaContainer() {
        if (observationTimeout) {
            clearTimeout(observationTimeout);
        }
        
        const container = document.querySelector('.cf-turnstile');
        if (!container) {
            observationTimeout = setTimeout(() => this.observeCaptchaContainer(), timeouts.observeDelay);
            return;
        }
        
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && 
                    container.querySelector('iframe') && 
                    currentState === captchaStates.LOADING) {
                    currentState = captchaStates.INTERACTIVE;
                    UIManager.updateStatusText();
                    observer.disconnect();
                }
            }
        });
        
        try {
            observer.observe(container, { childList: true, subtree: true });
        } catch (error) {
            console.error('[OBSERVER] Error observing container:', error);
            observationTimeout = setTimeout(() => this.observeCaptchaContainer(), timeouts.observeDelay);
            return;
        }
        
        // Fallback check
        setTimeout(() => {
            if (container.querySelector('iframe') && currentState === captchaStates.LOADING) {
                currentState = captchaStates.INTERACTIVE;
                UIManager.updateStatusText();
                observer.disconnect();
            }
        }, timeouts.iframeCheck);
    }
};

// Event handlers
const EventHandlers = {
    /**
     * Handle keyboard shortcuts
     */
    handleKeydown(e) {
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'I') {
            e.preventDefault();
            return false;
        }
        if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'J') {
            e.preventDefault();
            return false;
        }
        if (e.ctrlKey && e.key.toUpperCase() === 'U') {
            e.preventDefault();
            return false;
        }
    },

    /**
     * Handle window resize with debouncing
     */
    handleResize: Utils.debounce(() => {
        TitleAnimation.syncTitleFill();
    }, 100),

    /**
     * Cleanup on page unload
     */
    handleBeforeUnload() {
        if (observationTimeout) clearTimeout(observationTimeout);
        if (mainTimeoutId) clearTimeout(mainTimeoutId);
        if (resizeTimeout) clearTimeout(resizeTimeout);
    }
};

// Cloudflare Turnstile callbacks
const TurnstileCallbacks = {
    /**
     * Called before Turnstile becomes interactive
     */
    onBeforeInteractiveCallback() {
        if (!Utils.isValidBrowser()) {
            this.onUnsupportedCallback();
            return;
        }
        
        const previousState = currentState;
        currentState = captchaStates.INTERACTIVE;
        
        Analytics.trackStateChange(previousState, currentState);
        Analytics.trackEvent('turnstile_interactive');
        
        UIManager.updateStatusText();
    },

    /**
     * Called after Turnstile becomes interactive
     */
    onAfterInteractiveCallback() {
        const previousState = currentState;
        currentState = captchaStates.VERIFYING;
        
        Analytics.trackStateChange(previousState, currentState);
        Analytics.trackEvent('turnstile_verifying');
        
        UIManager.updateStatusText();
    },

    /**
     * Called when browser is unsupported
     */
    onUnsupportedCallback() {
        const previousState = currentState;
        currentState = captchaStates.ERROR;
        
        Analytics.trackStateChange(previousState, currentState);
        Analytics.trackEvent('browser_unsupported');
        
        UIManager.updateStatusText();
    },

    /**
     * Called on successful verification
     */
    async onSuccessCallback(token) {
        const startTime = Date.now();
        
        // Rate limiting check
        if (!SecurityManager.checkRateLimit()) {
            Analytics.trackEvent('rate_limit_exceeded');
            currentState = captchaStates.ERROR;
            UIManager.updateStatusText();
            return;
        }
        
        // Validate token
        if (!SecurityManager.validateTurnstileResponse(token)) {
            Analytics.trackEvent('invalid_token');
            currentState = captchaStates.ERROR;
            UIManager.updateStatusText();
            return;
        }
        
        if (!Utils.isValidBrowser()) {
            console.log('[PROTECT] Browser validation failed. Not setting cookie.');
            Analytics.trackEvent('browser_validation_failed');
            currentState = captchaStates.ERROR;
            UIManager.updateStatusText();
            return;
        }
        
        try {
            await RetryManager.executeWithRetry(
                () => CookieManager.setSecureCookie(token),
                'setSecureCookie'
            );
            
            const previousState = currentState;
            currentState = captchaStates.SUCCESS;
            
            Analytics.trackStateChange(previousState, currentState);
            Analytics.trackEvent('verification_success', {
                verificationTime: Date.now() - startTime
            });
            
            UIManager.updateStatusText();
            
            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = (urlParams.get('redirect') || '/').trim();
            
            setTimeout(() => {
                Utils.safeRedirect(redirectUrl);
            }, 1000);
            
        } catch (error) {
            PerformanceMonitor.recordError(error, 'onSuccessCallback');
            Analytics.trackEvent('verification_error', { error: error.message });
            currentState = captchaStates.ERROR;
            UIManager.updateStatusText();
        }
    },

    /**
     * Called on verification error
     */
    onErrorCallback() {
        const previousState = currentState;
        currentState = captchaStates.ERROR;
        
        Analytics.trackStateChange(previousState, currentState);
        Analytics.trackEvent('verification_error');
        
        UIManager.updateStatusText();
        
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.style.display = 'block';
        }
    }
};

// Main initialization
const App = {
    /**
     * Initialize the application
     */
    init() {
        PerformanceMonitor.recordMetric('loadTime', Date.now() - PerformanceMonitor.startTime);
        Analytics.trackEvent('app_initialized');
        
        // Check for existing cookies first
        if (CookieManager.checkExistingCookie()) {
            Analytics.trackEvent('cookie_found_redirect');
            return;
        }
        
        // Initialize UI
        TitleAnimation.resetTitleFill();
        UIManager.updateStatusText();
        
        // Start observing Turnstile container
        TurnstileObserver.observeCaptchaContainer();
        
        // Set main timeout
        mainTimeoutId = setTimeout(() => {
            if (!window.turnstile && currentState === captchaStates.LOADING) {
                const previousState = currentState;
                currentState = captchaStates.ERROR;
                
                Analytics.trackStateChange(previousState, currentState);
                Analytics.trackEvent('turnstile_timeout');
                
                UIManager.updateStatusText();
            }
        }, timeouts.mainTimeout);
        
        // Track performance after initialization
        setTimeout(() => {
            Analytics.trackPerformance();
        }, 5000);
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.addEventListener('keydown', EventHandlers.handleKeydown);
        window.addEventListener('resize', EventHandlers.handleResize);
        window.addEventListener('beforeunload', EventHandlers.handleBeforeUnload);
    }
};

// Global callback functions for Cloudflare Turnstile
window.onBeforeInteractiveCallback = TurnstileCallbacks.onBeforeInteractiveCallback.bind(TurnstileCallbacks);
window.onAfterInteractiveCallback = TurnstileCallbacks.onAfterInteractiveCallback.bind(TurnstileCallbacks);
window.onUnsupportedCallback = TurnstileCallbacks.onUnsupportedCallback.bind(TurnstileCallbacks);
window.onSuccessCallback = TurnstileCallbacks.onSuccessCallback.bind(TurnstileCallbacks);
window.onErrorCallback = TurnstileCallbacks.onErrorCallback.bind(TurnstileCallbacks);

// Global debugging utilities
window.ProtectionDebug = {
    /**
     * Get current state
     */
    getState() {
        return {
            currentState,
            captchaStates,
            performance: PerformanceMonitor.getSummary(),
            analytics: window.protectionAnalytics || []
        };
    },

    /**
     * Reset retry manager
     */
    resetRetries() {
        RetryManager.reset();
        console.log('[DEBUG] Retry manager reset');
    },

    /**
     * Clear analytics data
     */
    clearAnalytics() {
        window.protectionAnalytics = [];
        console.log('[DEBUG] Analytics cleared');
    },

    /**
     * Force state change (for testing)
     */
    forceState(newState) {
        if (captchaStates[newState]) {
            const previousState = currentState;
            currentState = captchaStates[newState];
            Analytics.trackStateChange(previousState, currentState);
            UIManager.updateStatusText();
            console.log(`[DEBUG] State changed from ${previousState} to ${currentState}`);
        } else {
            console.error('[DEBUG] Invalid state:', newState);
        }
    },

    /**
     * Get security fingerprint
     */
    getFingerprint() {
        return SecurityManager.generateFingerprint();
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.setupEventListeners();
    App.init();
});
