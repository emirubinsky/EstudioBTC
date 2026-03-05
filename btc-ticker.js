const btcPriceEl = document.querySelector("#btcPrice");
const btcChangeEl = document.querySelector("#btcChange");
const btcUpdatedEl = document.querySelector("#btcUpdated");

if (btcPriceEl && btcChangeEl && btcUpdatedEl) {
  const usdFormatterRounded = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const usdFormatterPrecise = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  const BTC_WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker";

  let btcSocket = null;
  let reconnectTimer = null;
  let backupRefreshTimer = null;
  let wsWatchdogTimer = null;
  let reconnectDelay = 1000;
  let lastWsMessageAt = 0;
  let restRefreshPromise = null;
  let isPageVisible = !document.hidden;

  function formatUsd(value) {
    return (value >= 1000 ? usdFormatterRounded : usdFormatterPrecise).format(
      value
    );
  }

  function updateBtcUi(price, change24h) {
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
        // Intenta el siguiente proveedor.
      }
    }

    throw new Error("No hay proveedor disponible");
  }

  async function updateBtcPriceFromRest() {
    if (restRefreshPromise) {
      return restRefreshPromise;
    }

    restRefreshPromise = (async () => {
      try {
        const { price, change24h } = await getBtcPriceWithFallback();
        updateBtcUi(price, change24h);
        return true;
      } catch (error) {
        showBtcUnavailable();
        return false;
      } finally {
        restRefreshPromise = null;
      }
    })();

    return restRefreshPromise;
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;

    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearBackupRefreshTimer() {
    if (!backupRefreshTimer) return;

    clearInterval(backupRefreshTimer);
    backupRefreshTimer = null;
  }

  function clearWsWatchdog() {
    if (!wsWatchdogTimer) return;

    clearInterval(wsWatchdogTimer);
    wsWatchdogTimer = null;
  }

  function startBackupRefresh() {
    if (!isPageVisible || backupRefreshTimer) return;

    backupRefreshTimer = setInterval(() => {
      updateBtcPriceFromRest();
    }, 120000);
  }

  function startWsWatchdog(socket) {
    clearWsWatchdog();

    wsWatchdogTimer = setInterval(() => {
      if (btcSocket !== socket || socket.readyState !== WebSocket.OPEN) return;

      if (Date.now() - lastWsMessageAt > 25000) {
        socket.close();
      }
    }, 15000);
  }

  function scheduleWsReconnect() {
    if (!isPageVisible) return;

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

  function closeBtcSocket() {
    if (!btcSocket) return;

    const socket = btcSocket;
    btcSocket = null;
    socket.close();
  }

  function connectBtcWebSocket() {
    if (!isPageVisible || typeof WebSocket === "undefined") return;

    if (
      btcSocket &&
      (btcSocket.readyState === WebSocket.CONNECTING ||
        btcSocket.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    let socket;

    try {
      socket = new WebSocket(BTC_WS_URL);
    } catch (error) {
      scheduleWsReconnect();
      return;
    }

    btcSocket = socket;

    socket.addEventListener("open", () => {
      if (btcSocket !== socket) return;

      reconnectDelay = 1000;
      lastWsMessageAt = Date.now();
      clearReconnectTimer();
      startWsWatchdog(socket);
    });

    socket.addEventListener("message", (event) => {
      if (btcSocket !== socket) return;

      handleWsMessage(event.data);
    });

    socket.addEventListener("error", () => {
      if (btcSocket === socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      if (btcSocket === socket) {
        btcSocket = null;
      }

      clearWsWatchdog();

      if (!isPageVisible) return;

      scheduleWsReconnect();
      updateBtcPriceFromRest();
    });
  }

  function resumeTicker() {
    if (isPageVisible) return;

    isPageVisible = true;
    reconnectDelay = 1000;
    updateBtcPriceFromRest();
    connectBtcWebSocket();
    startBackupRefresh();
  }

  function pauseTicker() {
    if (!isPageVisible) return;

    isPageVisible = false;
    clearReconnectTimer();
    clearBackupRefreshTimer();
    clearWsWatchdog();
    closeBtcSocket();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseTicker();
      return;
    }

    resumeTicker();
  });

  window.addEventListener("pagehide", pauseTicker);

  if (isPageVisible) {
    updateBtcPriceFromRest();
    connectBtcWebSocket();
    startBackupRefresh();
  }
}
