const sections = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.18 }
);

sections.forEach((section) => observer.observe(section));

const form = document.querySelector(".signup-form");

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const note = form.querySelector("small");
    if (button) {
      button.textContent = "Solicitud enviada";
      button.disabled = true;
    }
    if (note) {
      note.textContent =
        "Gracias. Emibit se va a contactar contigo dentro de las próximas 24 horas hábiles.";
    }
  });
}

const btcPriceEl = document.querySelector("#btcPrice");
const btcChangeEl = document.querySelector("#btcChange");
const btcUpdatedEl = document.querySelector("#btcUpdated");

function formatUsd(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function updateBtcUi(price, change24h) {
  if (!btcPriceEl || !btcChangeEl || !btcUpdatedEl) return;

  btcPriceEl.textContent = formatUsd(price);

  if (typeof change24h === "number") {
    const sign = change24h >= 0 ? "+" : "";
    btcChangeEl.textContent = `${sign}${change24h.toFixed(2)}% (24h)`;
    btcChangeEl.classList.toggle("btc-change-up", change24h >= 0);
    btcChangeEl.classList.toggle("btc-change-down", change24h < 0);
  } else {
    btcChangeEl.textContent = "Variación 24h no disponible";
    btcChangeEl.classList.remove("btc-change-up", "btc-change-down");
  }

  btcUpdatedEl.textContent = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showBtcUnavailable() {
  if (!btcPriceEl || !btcChangeEl || !btcUpdatedEl) return;

  btcPriceEl.textContent = "No disponible";
  btcChangeEl.textContent = "Sin conexión con proveedores";
  btcChangeEl.classList.remove("btc-change-up", "btc-change-down");
  btcUpdatedEl.textContent = new Date().toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("HTTP error");
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getBtcFromCoinGecko() {
  const data = await fetchJsonWithTimeout(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
    4500
  );

  if (!data || !data.bitcoin || typeof data.bitcoin.usd !== "number") {
    throw new Error("Dato inválido CoinGecko");
  }

  return {
    price: data.bitcoin.usd,
    change24h:
      typeof data.bitcoin.usd_24h_change === "number"
        ? data.bitcoin.usd_24h_change
        : null,
  };
}

async function getBtcFromCoinbase() {
  const data = await fetchJsonWithTimeout(
    "https://api.coinbase.com/v2/prices/BTC-USD/spot",
    4500
  );

  const amount = data && data.data ? Number(data.data.amount) : NaN;

  if (!Number.isFinite(amount)) {
    throw new Error("Dato inválido Coinbase");
  }

  return {
    price: amount,
    change24h: null,
  };
}

async function getBtcFromKraken() {
  const data = await fetchJsonWithTimeout(
    "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
    4500
  );

  const result = data && data.result ? data.result.XXBTZUSD : null;
  const price = result && result.c ? Number(result.c[0]) : NaN;

  if (!Number.isFinite(price)) {
    throw new Error("Dato inválido Kraken");
  }

  return {
    price,
    change24h: null,
  };
}

async function getBtcPriceWithFallback() {
  const providers = [getBtcFromCoinGecko, getBtcFromCoinbase, getBtcFromKraken];

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      // Try next provider.
    }
  }

  throw new Error("No hay proveedor disponible");
}

async function updateBtcPriceFromRest() {
  try {
    const { price, change24h } = await getBtcPriceWithFallback();
    updateBtcUi(price, change24h);
    return true;
  } catch (error) {
    showBtcUnavailable();
    return false;
  }
}

const BTC_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker";
let btcSocket = null;
let reconnectTimer = null;
let wsWatchdogTimer = null;
let reconnectDelay = 1000;
let lastWsMessageAt = 0;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function startWsWatchdog() {
  if (wsWatchdogTimer) {
    clearInterval(wsWatchdogTimer);
  }

  wsWatchdogTimer = setInterval(() => {
    if (!btcSocket || btcSocket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastWsMessageAt > 25000) {
      btcSocket.close();
    }
  }, 15000);
}

function scheduleWsReconnect() {
  clearReconnectTimer();

  reconnectTimer = setTimeout(() => {
    connectBtcWebSocket();
  }, reconnectDelay);

  reconnectDelay = Math.min(Math.floor(reconnectDelay * 1.8), 30000);
}

function handleWsMessage(raw) {
  let payload;

  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return;
  }

  const price = Number(payload.c);
  const change24h = Number(payload.P);

  if (!Number.isFinite(price)) {
    return;
  }

  lastWsMessageAt = Date.now();
  updateBtcUi(price, Number.isFinite(change24h) ? change24h : null);
}

function connectBtcWebSocket() {
  if (!btcPriceEl || !btcChangeEl || !btcUpdatedEl) return;
  if (typeof WebSocket === "undefined") return;

  try {
    btcSocket = new WebSocket(BTC_WS_URL);
  } catch (error) {
    scheduleWsReconnect();
    return;
  }

  btcSocket.addEventListener("open", () => {
    reconnectDelay = 1000;
    lastWsMessageAt = Date.now();
    startWsWatchdog();
  });

  btcSocket.addEventListener("message", (event) => {
    handleWsMessage(event.data);
  });

  btcSocket.addEventListener("error", () => {
    if (btcSocket && btcSocket.readyState === WebSocket.OPEN) {
      btcSocket.close();
    }
  });

  btcSocket.addEventListener("close", () => {
    scheduleWsReconnect();
    updateBtcPriceFromRest();
  });
}

if (btcPriceEl && btcChangeEl && btcUpdatedEl) {
  updateBtcPriceFromRest();
  connectBtcWebSocket();

  // Backup refresh to keep data available even if websocket is blocked.
  setInterval(updateBtcPriceFromRest, 120000);
}
