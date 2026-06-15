import WebSocket from "ws";
import { setLatestPrice, buildLivePrice, type LivePrice } from "./priceEvents.js";
import { logger } from "./logger.js";

const SPREAD = 0.35;
const TD_WS_BASE = "wss://ws.twelvedata.com/v1/quotes/price";
const GOLD_SYMBOL = "XAU/USD";

const RECONNECT_DELAY_BASE = 5_000;
const RECONNECT_DELAY_MAX  = 120_000;

let ws: WebSocket | null = null;
let reconnectDelay = RECONNECT_DELAY_BASE;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _connected = false;
let _reconnectCount = 0;

// Exported so Finnhub stream can check staleness
let _lastTick = 0;
export function getLastTwelveDataTickMs(): number { return _lastTick; }
export function getTwelveDataStatus(): { connected: boolean; lastTickMs: number; reconnectCount: number; msSinceLastTick: number } {
  return {
    connected: _connected,
    lastTickMs: _lastTick,
    reconnectCount: _reconnectCount,
    msSinceLastTick: _lastTick > 0 ? Date.now() - _lastTick : -1,
  };
}

function handleMessage(raw: string) {
  let msg: unknown;
  try { msg = JSON.parse(raw); } catch { return; }
  if (typeof msg !== "object" || msg === null) return;

  const ev = msg as Record<string, unknown>;
  const event = ev["event"] as string | undefined;

  // Ignore heartbeats and subscription confirmations
  if (event === "heartbeat" || event === "subscribe-status") return;

  if (event === "price") {
    const rawPrice = ev["price"];
    const rawTs    = ev["timestamp"];
    const price    = typeof rawPrice === "string" ? parseFloat(rawPrice)
                   : typeof rawPrice === "number" ? rawPrice
                   : NaN;
    if (!price || isNaN(price)) return;

    const ts = typeof rawTs === "number" ? rawTs * 1000 : Date.now();
    const bid = +(price - SPREAD / 2).toFixed(2);
    const ask = +(price + SPREAD / 2).toFixed(2);

    logger.info(
      { "[TwelveData] Price": +price.toFixed(2), Time: Date.now(), bid, ask, "Spread": SPREAD },
      "[TwelveData] Price received"
    );
    if (SPREAD > 1.0) {
      logger.warn({ spread: SPREAD }, "[TwelveData] WARNING: Spread too wide, likely Asian session");
    }

    const live: LivePrice = {
      price:         +price.toFixed(2),
      bid,
      ask,
      spread:        SPREAD,
      change:        0,
      changePercent: 0,
      high24h:       +price.toFixed(2),
      low24h:        +price.toFixed(2),
      timestamp:     new Date(ts).toISOString(),
      direction:     "unchanged",
      ms:            ts,
      source:        "twelvedata",
    };

    _lastTick = Date.now();
    setLatestPrice(live);
    return;
  }

  if (event === "error") {
    logger.error({ msg: ev["message"] }, "TwelveData WebSocket error");
  }
}

function connect() {
  const apiKey = process.env["TWELVEDATA_API_KEY"] ?? process.env["POLYGON_API_KEY"];
  if (!apiKey) {
    logger.warn("No TWELVEDATA_API_KEY or POLYGON_API_KEY — TwelveData stream disabled; Finnhub is primary");
    return;
  }

  const url = `${TD_WS_BASE}?apikey=${apiKey}`;
  logger.info("Connecting to TwelveData WebSocket for real-time XAU/USD ticks…");

  ws = new WebSocket(url);

  ws.on("open", () => {
    logger.info("TwelveData WebSocket connected — subscribing to XAU/USD");
    ws?.send(JSON.stringify({ action: "subscribe", params: { symbols: GOLD_SYMBOL } }));
    reconnectDelay = RECONNECT_DELAY_BASE;
    _connected = true;
  });

  ws.on("message", (data: WebSocket.RawData) => {
    handleMessage(data.toString());
  });

  ws.on("error", (err) => {
    logger.warn({ err: err.message }, "TwelveData WebSocket error");
  });

  ws.on("close", (code, reason) => {
    logger.warn({ code, reason: reason.toString() }, "TwelveData disconnected — will reconnect");
    _connected = false;
    _reconnectCount++;
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

export function startTwelveDataStream() {
  connect();
}
