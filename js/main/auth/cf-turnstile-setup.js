// /js/main/auth/cf-turnstile-setup.js
(function() {
    'use strict';
    
    if (typeof window.__TURNSTILE_SECURE__ !== 'undefined') return;
    window.__TURNSTILE_SECURE__ = true;
    
    const CONFIG = {
        production: '0x4AAAAAAB0s4O-sxm9ZnAQk',
        test: '1x00000000000000000000AA'
    };
    
    function isValidKey(key) {
        return Object.values(CONFIG).includes(key);
    }
    
    function isDevelopment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' || 
               hostname === '127.0.0.1' ||
               hostname === '' ||
               hostname.includes('.local') ||
               window.location.port !== '';
    }
    
    function initTurnstile() {
        const siteKey = isDevelopment() ? CONFIG.test : CONFIG.production;
        
        if (!isValidKey(siteKey)) {
            console.error('Invalid Turnstile key');
            return;
        }
        
        const elements = document.querySelectorAll('.cf-turnstile');
        elements.forEach((element, index) => {
            element.setAttribute('data-sitekey', siteKey);
            if (!element.id) {
                element.id = `turnstile-${index}`;
            }
        });
        
        if (isDevelopment()) {
            console.log('Turnstile: Using Test Key for development');
        }
    }
    
    window.resetAllTurnstiles = function() {
        if (window.turnstile) {
            document.querySelectorAll('.cf-turnstile').forEach(element => {
                window.turnstile.reset(element);
            });
        }
        window.captchaToken = '';
    };
    
    document.addEventListener('DOMContentLoaded', initTurnstile);
})();