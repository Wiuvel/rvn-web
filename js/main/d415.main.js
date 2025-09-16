tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef9ff', 100: '#d7f1ff', 200: '#b0e5ff', 300: '#7cd4ff', 400: '#45beff', 500: '#16a3ff', 600: '#0f7fdb', 700: '#0f65ad', 800: '#114f86', 900: '#113f69'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0,0,0,0.08)',
        glow: '0 0 20px rgba(22,163,255,0.6)'
      },
      animation: {
        fadeIn: 'fadeIn 0.5s ease-in forwards',
        float: 'float 3s ease-in-out infinite',
        pulseFloat: 'pulseFloat 3s ease-in-out infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0, transform: 'translateY(15px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        pulseFloat: {
          '0%': { transform: 'translateY(0) scale(1)' },
          '25%': { transform: 'translateY(-4px) scale(1.02)' },
          '50%': { transform: 'translateY(0) scale(1)' },
          '75%': { transform: 'translateY(4px) scale(0.98)' },
          '100%': { transform: 'translateY(0) scale(1)' }
        }
      }
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const pingEl = document.getElementById("ping-value");
  const sessionEl = document.getElementById("session-status");
  const statusEl = document.getElementById("connection-status");
  const loaderEl = document.getElementById("server-loader");
  const serverEl = document.getElementById("server-info");
  const nameEl = document.getElementById("server-name");
  const flagEl = document.getElementById("server-flag");

  const servers = [
    { country: "Германия", code: "DE-1", flag: "https://rvn.guru/static/icons/flags/de.svg" },
    { country: "Германия", code: "DE-2", flag: "https://rvn.guru/static/icons/flags/de.svg" },
    { country: "Швеция", code: "SWE-1", flag: "https://rvn.guru/static/icons/flags/swe.svg" },
    { country: "Швеция", code: "SWE-2", flag: "https://rvn.guru/static/icons/flags/swe.svg" }
  ];

  let ping = 45 + Math.random() * 5;
  let connected = false;

  function updatePing() {
    if (!connected) return;
    let change = (Math.random() * 7 + 5) * (Math.random() > 0.5 ? 1 : -1);
    ping += change + (50 - ping) * 0.02;
    if (Math.random() < 0.15) ping += Math.random() * 20;
    ping = Math.min(Math.max(ping, 45), 95);

    const val = Math.round(ping);
    pingEl.textContent = `${val} ms`;

    if (val <= 65) {
      pingEl.style.color = "#4ade80";
    } else if (val <= 80) {
      pingEl.style.color = "#facc15";
    } else {
      pingEl.style.color = "#fb923c";
    }

    pingEl.classList.remove("shift");
    void pingEl.offsetWidth;
    pingEl.classList.add("shift");
  }

  function connectSession() {
    sessionEl.textContent = "Сеанс защищён";
    sessionEl.classList.add("shift");

    statusEl.textContent = "";
    const dot = document.createElement("span");
    dot.classList.add("inline-block", "h-2", "w-2", "rounded-full", "bg-green-400", "animate-pulse");
    statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode(" Подключено"));

    statusEl.classList.remove("text-yellow-400");
    statusEl.classList.add("text-green-400", "shift");

    connected = true;

    chooseServer();
    updatePing();

    setInterval(updatePing, 1200);
  }

  function chooseServer() {
    loaderEl.classList.add("hidden");
    serverEl.classList.remove("hidden");

    const chosen = servers[Math.floor(Math.random() * servers.length)];
    nameEl.textContent = `${chosen.country} · ${chosen.code}`;
    flagEl.src = chosen.flag;
    flagEl.alt = chosen.country;

    serverEl.classList.add("shift");
  }

  setTimeout(connectSession, 1000);

  function openHiddify() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = "https://apps.apple.com/us/app/hiddify-proxy-vpn/id6596777532";
    } else if (/android/i.test(ua)) {
      window.location.href = "https://play.google.com/store/apps/details?id=app.hiddify.com";
    } else {
      alert("Откройте страницу с телефона, чтобы скачать приложение.");
    }
  }
  function openV2rayTun() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
      window.location.href = "https://apps.apple.com/us/app/v2raytun/id6476628951";
    } else if (/android/i.test(ua)) {
      window.location.href = "https://play.google.com/store/apps/details?id=com.v2raytun.android";
    } else {
      alert("Откройте страницу с телефона, чтобы скачать приложение.");
    }
  }
  document.getElementById("btn-hiddify").addEventListener("click", (e) => {
    e.preventDefault();
    openHiddify();
  });
  document.getElementById("btn-v2raytun").addEventListener("click", (e) => {
    e.preventDefault();
    openV2rayTun();
  });
  document.getElementById('year').textContent = new Date().getFullYear();

  const elements = document.querySelectorAll(".fade-in");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  elements.forEach(el => observer.observe(el));

  if (window.matchMedia('(min-width: 1025px)').matches) {
    if (typeof particlesJS === 'function') {
      try {
        particlesJS("particles-js", {
          particles: {
            number: { value: 20 },
            color: { value: "#16a3ff" },
            shape: { type: "circle" },
            opacity: { value: 0.4 },
            size: { value: 2, random: true },
            line_linked: { enable: false },
            move: { enable: true, speed: 0.6, direction: "none", random: true, straight: false, out_mode: "out" }
          },
          interactivity: {
            detect_on: "canvas",
            events: { onhover: { enable: false }, onclick: { enable: false } }
          },
          retina_detect: true
        });
      } catch(e) {
        console.warn('Particles Init Failed', e);
      }
    }
  } else {
    const p = document.getElementById('particles-js'); if (p) p.style.display = 'none';
  }

  let progress = document.getElementById('page-progress');
  let timer;
  function startProgress() {
    if (!progress) return;
    progress.style.width = '0';
    progress.style.opacity = '1';
    setTimeout(() => { progress.style.width = '60%'; }, 10);
    timer = setTimeout(() => { progress.style.width = '100%'; }, 600);
  }
  function endProgress() {
    if (!progress) return;
    progress.style.width = '100%';
    setTimeout(() => { progress.style.opacity = '0'; progress.style.width = '0'; }, 400);
    clearTimeout(timer);
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', function(e) {
      const id = this.getAttribute('href').slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        startProgress();
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          endProgress();
        }, 250);
      }
    });
  });
});
