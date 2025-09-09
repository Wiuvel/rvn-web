document.addEventListener("DOMContentLoaded", () => {
  const pingEl = document.getElementById("ping-value");
  const sessionEl = document.getElementById("session-status");
  const statusEl = document.getElementById("connection-status");
  const loaderEl = document.getElementById("server-loader");
  const serverEl = document.getElementById("server-info");
  const nameEl = document.getElementById("server-name");
  const flagEl = document.getElementById("server-flag");

  const servers = [
    { country: "Германия", code: "DE-1", flag: "https://rvn.guru/static/flags/de.svg" },
    { country: "Германия", code: "DE-2", flag: "https://rvn.guru/static/flags/de.svg" },
    { country: "Швеция", code: "SWE-1", flag: "https://rvn.guru/static/flags/swe.svg" },
    { country: "Швеция", code: "SWE-2", flag: "https://rvn.guru/static/flags/swe.svg" }
  ];

  let ping = 50, connected = false;

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

    statusEl.innerHTML = '<span class="inline-block h-2 w-2 rounded-full bg-green-400 animate-pulse"></span> Подключено';
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
    serverEl.classList.add("shift");
  }

  setTimeout(connectSession, 1000);
});