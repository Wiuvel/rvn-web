(function () {
    'use strict';

    if (typeof window.__TURNSTILE_SECURE__ !== 'undefined') return;
    window.__TURNSTILE_SECURE__ = true;

    const CONFIG = {
        production: '0x4AAAAAAB0s4O-sxm9ZnAQk',
        test: '1x00000000000000000000AA'
    };

    function isDevelopment() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               hostname === '' ||
               hostname.includes('.local') ||
               window.location.port !== '';
    }

    function getSiteKey() {
        return isDevelopment() ? CONFIG.test : CONFIG.production;
    }

    function renderTurnstiles() {
        const siteKey = getSiteKey();
        document.querySelectorAll('.cf-turnstile').forEach((el) => {
            if (el.offsetParent === null) return; // не рендерим скрытые
            if (!el.dataset.rendered) {
                el.dataset.rendered = 'true';
                turnstile.render(el, {
                    sitekey: siteKey,
                    callback: token => {
                        window.captchaToken = token;
                        const alpineScope = document.querySelector('[x-data="authForms()"]');
                        if (alpineScope && alpineScope.__x) {
                            alpineScope.__x.$data.captchaResponse = token;
                        }
                    }
                });
            }
        });
    }

    function initTurnstile() {
        if (!document.querySelector('script[data-turnstile]')) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady';
            script.async = true;
            script.defer = true;
            script.dataset.turnstile = 'true';
            document.head.appendChild(script);
        }

        window.onTurnstileReady = renderTurnstiles;

        const observer = new MutationObserver(() => {
            if (window.turnstile) renderTurnstiles();
        });
        observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    }

    window.resetAllTurnstiles = function () {
        if (window.turnstile) {
            document.querySelectorAll('.cf-turnstile-manual').forEach((el) => {
                if (el.offsetParent === null) return;
                if (!el.dataset.rendered) {
                    el.dataset.rendered = 'true';
                    turnstile.render(el, {
                        sitekey: getSiteKey(),
                        callback: token => {
                            window.captchaToken = token;
                            const alpineScope = document.querySelector('[x-data="authForms()"]');
                            if (alpineScope && alpineScope.__x) {
                                alpineScope.__x.$data.captchaResponse = token;
                            }
                        }
                    });
                }
            });
        }
        window.captchaToken = '';
    };

    window.initTurnstile = initTurnstile;
    document.addEventListener('DOMContentLoaded', initTurnstile);
})();
