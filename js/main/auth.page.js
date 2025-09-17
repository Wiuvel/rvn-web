window.addEventListener('DOMContentLoaded', () => {
  const fill = document.getElementById('preloader-text-fill');
  const base = document.getElementById('preloader-text-base');
  if (fill && base) {
    setTimeout(() => {
      fill.style.width = base.offsetWidth + 'px';
    }, 80);
  }

  const preloader = document.getElementById('preloader');
  if (preloader) {
    setTimeout(() => {
      preloader.style.opacity = '0';
      setTimeout(() => {
        preloader.style.display = 'none';
      }, 400);
    }, 1200);
  }
});

window.authForms = function authForms() {
  return {
    currentTab: 'login',
    isLoading: false,
    registerData: { username: '', password: '', confirmPassword: '' },
    loginData: { username: '', password: '' },
    isPasswordValid: { register: false, login: false },
    showPasswordStrength: { register: false, login: false },
    showPassword: { register: false, login: false },
    errors: {
      global: '',
      register: { username: '', password: '', confirmPassword: '' },
      login: { username: '', password: '' }
    },
    captchaResponse: { register: '', login: '' },
    currentWidgetId: null,
    init() {
      this.loadCaptcha(this.currentTab);
    },
    switchTab(tab) {
      this.currentTab = tab;
      this.resetForm();
      setTimeout(() => { this.loadCaptcha(tab); }, 50);
    },
    loadCaptcha(formType) {
      if (this.currentWidgetId && typeof window.turnstile !== 'undefined') {
        window.turnstile.remove(this.currentWidgetId);
      }

      const containerId = `${formType}-captcha-container`;
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = '';

      if (typeof window.turnstile !== 'undefined') {
        this.currentWidgetId = window.turnstile.render('#' + containerId, {
          sitekey: '0x4AAAAAAB0s4O-sxm9ZnAQk',
          theme: 'dark',
          callback: (token) => {
            this.captchaResponse[formType] = token;
            this.errors.global = '';
          },
          'error-callback': () => {
            this.captchaResponse[formType] = '';
            this.errors.global = 'Ошибка загрузки капчи';
          }
        });
      } else {
        setTimeout(() => this.loadCaptcha(formType), 100);
      }
    },
    validateUsername(username, formType) {
      const usernameRegex = /^[a-zA-Z0-9_]+$/;
      if (!usernameRegex.test(username)) {
        this.errors[formType].username = 'Логин может содержать только латиницу и цифры';
        return false;
      }
      if (username.length < 3) {
        this.errors[formType].username = 'Логин должен быть не короче 3 символов';
        return false;
      }
      this.errors[formType].username = '';
      return true;
    },
    validatePassword(password, formType) {
      const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+]+$/;
      if (password.length === 0) {
        this.errors[formType].password = '';
        this.isPasswordValid[formType] = false;
        this.showPasswordStrength[formType] = false;
        if (formType === 'register') {
          this.registerData.confirmPassword = '';
          this.errors.register.confirmPassword = '';
        }
        return false;
      }
      if (!passwordRegex.test(password)) {
        this.errors[formType].password = 'Пароль может содержать только латиницу, цифры и спецсимволы';
        this.isPasswordValid[formType] = false;
        this.showPasswordStrength[formType] = false;
        if (formType === 'register') {
          this.registerData.confirmPassword = '';
          this.errors.register.confirmPassword = '';
        }
        return false;
      }
      if (password.length < 6) {
        this.errors[formType].password = 'Пароль должен быть не менее 6 символов';
        this.isPasswordValid[formType] = false;
        this.showPasswordStrength[formType] = false;
        if (formType === 'register') {
          this.registerData.confirmPassword = '';
          this.errors.register.confirmPassword = '';
        }
        return false;
      }
      this.errors[formType].password = '';
      this.isPasswordValid[formType] = true;
      this.showPasswordStrength[formType] = true;
      return true;
    },
    validateConfirmPassword() {
      if (!this.registerData.confirmPassword) {
        this.errors.register.confirmPassword = '';
        this.showPasswordStrength.register = true;
        return true;
      }
      this.showPasswordStrength.register = false;
      if (this.registerData.confirmPassword !== this.registerData.password) {
        this.errors.register.confirmPassword = 'Пароли не совпадают';
        return false;
      }
      this.errors.register.confirmPassword = '';
      return true;
    },
    async handleRegister() {
      if (!this.validateForm('register')) return;
      this.isLoading = true;
      this.errors.global = '';
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.escapeHtml(this.registerData.username),
            password: this.registerData.password,
            'cf-turnstile-response': this.captchaResponse.register
          })
        });
        const data = await response.json();
        if (response.ok) {
          window.location.href = '/dashboard';
        } else {
          this.errors.global = this.escapeHtml(data.message || 'Ошибка регистрации');
        }
      } catch (error) {
        this.errors.global = 'API ERROR: 405';
      } finally {
        this.isLoading = false;
      }
    },
    async handleLogin() {
      if (!this.validateForm('login')) return;
      this.isLoading = true;
      this.errors.global = '';
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.escapeHtml(this.loginData.username),
            password: this.loginData.password,
            'cf-turnstile-response': this.captchaResponse.login
          })
        });
        const data = await response.json();
        if (response.ok) {
          window.location.href = '/dashboard';
        } else {
          this.errors.global = this.escapeHtml(data.message || 'Ошибка входа');
        }
      } catch (error) {
        this.errors.global = 'Ошибка сети. Попробуйте позже.';
      } finally {
        this.isLoading = false;
      }
    },
    validateForm(formType) {
      const isValidUsername = this.validateUsername(this[formType + 'Data'].username, formType);
      const isValidPassword = this.validatePassword(this[formType + 'Data'].password, formType);
      let isValidConfirm = true;
      if (formType === 'register') {
        isValidConfirm = this.validateConfirmPassword();
      }
      const hasCaptcha = !!this.captchaResponse[formType];
      if (!hasCaptcha) {
        this.errors.global = 'Подтвердите, что вы не робот';
        return false;
      }
      return isValidUsername && isValidPassword && isValidConfirm;
    },
    async oauthLogin(provider) {
      this.isLoading = true;
      try {
        window.location.href = `/auth/${provider}`;
      } catch (error) {
        this.errors.global = 'Ошибка подключения к провайдеру';
        this.isLoading = false;
      }
    },
    escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },
    resetForm() {
      this.registerData = { username: '', password: '', confirmPassword: '' };
      this.loginData = { username: '', password: '' };
      this.errors = {
        global: '',
        register: { username: '', password: '', confirmPassword: '' },
        login: { username: '' , password: '' }
      };
      this.isPasswordValid = { register: false, login: false };
      this.showPasswordStrength = { register: false, login: false };
      this.captchaResponse = { register: '', login: '' };
    }
  };
};

function initParticles() {
  if (window.innerWidth >= 1024 && typeof window.particlesJS !== 'undefined') {
    window.particlesJS('particles-js', {
      particles: {
        number: { value: 30 },
        color: { value: '#16a3ff' },
        shape: { type: 'circle' },
        opacity: { value: 0.4 },
        size: { value: 2, random: true },
        line_linked: { enable: false },
        move: { enable: true, speed: 0.6, direction: 'none', random: true, straight: false, out_mode: 'out' }
      },
      interactivity: {
        detect_on: 'canvas',
        events: { onhover: { enable: false }, onclick: { enable: false } }
      },
      retina_detect: true
    });
    return true;
  }
  return false;
}

function tryInitParticlesWithRetry(retries = 10, delayMs = 200) {
  if (initParticles()) return;
  if (retries <= 0) return;
  setTimeout(() => tryInitParticlesWithRetry(retries - 1, delayMs), delayMs);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => tryInitParticlesWithRetry());
} else {
  tryInitParticlesWithRetry();
}



