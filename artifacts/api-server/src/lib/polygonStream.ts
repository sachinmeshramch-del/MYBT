import WebSocket from "ws";
import { setLatestPrice, buildLivePrice, type LivePrice } from "./priceEvents.js";
import { fetchGoldPrice } from "./goldPrice.js";
import { logger } from "./logger.js";
import { getLastTwelveDataTickMs } from "./twelveDataStream.js";

// TwelveData is ALWAYS primary. Finnhub only fires if TwelveData has been
// completely silent for TD_STALE_MS. Any TwelveData tick within that window
// hard-suppresses Finnhub — no exceptions.
const TD_STALE_MS = 5_000; // raised from 3s → 5s for extra safety margin

const SPREAD = 0.35;
const FINNHUB_WS_BASE = "wss://ws.finnhub.io";
const GOLD_SYMBOL = "OANDA:XAU_USD";

const RECONNECT_DELAY_BASE = 5_000;
const RECONNECT_DELAY_MAX  = 120_000;

// Grace period after server start — let TwelveData establish first
// so Finnhub doesn't race it at boot
const STARTUP_GRACE_MS = 10_000;
const _startedAt = Date.now();

let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_DELAY_BASE;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let finnhubConnected = false;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let _finnhubReconnectCount = 0;

// Track last Finnhub tick time for status reporting only
let lastFinnhubTickMs = 0;
const FALLBACK_GAP_MS = 2000;

export function getFinnhubStatus() {
  return {
    connected: finnhubConnected,
    hasApiKey: !!process.env["FINNHUB_API_KEY"],
    lastTickMs: lastFinnhubTickMs,
    msSinceLastTick: lastFinnhubTickMs > 0 ? Date.now() - lastFinnhubTickMs : -1,
    reconnectCount: _finnhubReconnectCount,
  };
}

// ── Goldprice.org gap-filler polling ──────────────────────────────────────
// Fires at 2s; skips if TwelveData or Finnhub sent a recent tick
function startFallbackPolling() {
  if (fallbackTimer) return;
  logger.info("Starting goldprice.org gap-filler polling (2s)");
  fallbackTimer = setInterval(async () => {
    const tdSilentMs = Date.now() - getLastTwelveDataTickMs();
    const fhSilentMs = Date.now() - lastFinnhubTickMs;
    // Skip if either premium source is active
    if (tdSilentMs <= TD_STALE_MS) return;
    if (finnhubConnected && fhSilentMs < FALLBACK_GAP_MS) return;
    try {
      const raw = await fetchGoldPrice();
      const live = buildLivePrice(raw, SPREAD, "goldprice");
      setLatestPrice(live);
    } catch {
      // ignore
    }
  }, 2000);
}

// ── Finnhub message handler ────────────────────────────────────────────────
function handleMessage(raw: string) {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return; }
  if (typeof msg !== "object" || msg === null) return;

  const ev = msg as Record<string, unknown>;
  const type = ev["type"] as string;

  if (type === "trade") {
    const ticks = ev["data"] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(ticks) || ticks.length === 0) return;

    const tick = ticks[ticks.length - 1];
    const price = tick["p"] as number | undefined;
    const t     = tick["t"] as number | undefined;
    if (!price) return;

    // Record tick time for status reporting (always, even if suppressed)
    lastFinnhubTickMs = Date.now();

    // ── Hard suppression: TwelveData takes absolute priority ──────────────
    const tdLastTick = getLastTwelveDataTickMs();
    const tdSilentMs = Date.now() - tdLastTick;
    const inStartupGrace = (Date.now() - _startedAt) < STARTUP_GRACE_MS;

    // Suppress if: TwelveData has ticked at all AND is within stale window
    // Also suppress during startup grace period so TD can establish first
    if (inStartupGrace || (tdLastTick > 0 && tdSilentMs <= TD_STALE_MS)) {
      logger.debug(
        { tdSilentMs, threshold: TD_STALE_MS, inStartupGrace },
        "[Finnhub] Suppressed — TwelveData is primary source"
      );
      return;
    }

    const bid = +(price - SPREAD / 2).toFixed(2);
    const ask = +(price + SPREAD / 2).toFixed(2);

    logger.info(
      { "[Finnhub→ACTIVE] Price": +price.toFixed(2), tdSilentMs },
      "[Finnhub] Taking over — TwelveData silent"
    );

    const live: LivePrice = {
      price:         +price.toFixed(2),
      bid,
      ask,
      spread:        SPREAD,
      change:        0,
      changePercent: 0,
      high24h:       +price.toFixed(2),
      low24h:        +price.toFixed(2),
      timestamp:     t ? new Date(t).toISOString() : new Date().toISOString(),
      direction:     "unchanged",
      ms:            t ?? Date.now(),
      source:        "finnhub",
    };

    setLatestPrice(live);
    return;
  }

  if (type === "error") {
    logger.error({ msg: ev["msg"] }, "Finnhub WebSocket error message");
    return;
  }
}

// ── Connection management ──────────────────────────────────────────────────
function connect() {
  const apiKey = process.env["FINNHUB_API_KEY"];
  if (!apiKey) {
    logger.warn("FINNHUB_API_KEY not set — using goldprice.org fallback only");
    startFallbackPolling();
    return;
  }

  const url = `${FINNHUB_WS_BASE}?token=${apiKey}`;
  logger.info("Connecting to Finnhub WebSocket (backup — TwelveData is primary)…");

  ws = new WebSocket(url);

  ws.on("open", () => {
    logger.info("Finnhub WebSocket connected — subscribed to OANDA:XAU_USD (backup mode)");
    ws?.send(JSON.stringify({ type: "subscribe", symbol: GOLD_SYMBOL }));
    finnhubConnected = true;
    reconnectDelay = RECONNECT_DELAY_BASE;
  });

  ws.on("message", (data: WebSocket.RawData) => {
    handleMessage(data.toString());
  });

  ws.on("error", (err) => {
    logger.warn({ err: err.message }, "Finnhub WebSocket error");
  });

  ws.on("close", (code, reason) => {
    finnhubConnected = false;
    _finnhubReconnectCount++;
    logger.warn({ code, reason: reason.toString() }, "Finnhub disconnected — will reconnect");
    startFallbackPolling();
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_DELAY_MAX);
  }, reconnectDelay);
}

export function startPolygonStream() {
  startFallbackPolling();
  connect();
}
