import { EventEmitter } from "events";
import type { PriceData } from "./goldPrice.js";
import { logger } from "./logger.js";

export interface LivePrice extends PriceData {
  bid: number;
  ask: number;
  spread: number;
  direction: "up" | "down" | "unchanged";
  ms: number;
  source: "twelvedata" | "finnhub" | "polygon" | "goldprice" | "yahoo" | "synthetic";
}

class PriceEventEmitter extends EventEmitter {}
export const priceEmitter = new PriceEventEmitter();

// Shared mutable price state written by all sources
let _latestPrice: LivePrice | null = null;
let _prevPrice: number | null = null;

// Circular tick history — last 500 ticks so new clients can pre-populate charts
const TICK_BUFFER_SIZE = 500;
const _tickHistory: LivePrice[] = [];

// Track which source last wrote so we can detect simultaneous writes
let _lastSourceTime: Record<string, number> = {};
const SIMULTANEOUS_WINDOW_MS = 500; // flag if two sources write within 500ms

export function setLatestPrice(price: LivePrice) {
  const now = Date.now();
  const prevPrice = _latestPrice?.price ?? null;
  const spread = +(price.ask - price.bid).toFixed(2);

  // ── Active source log ──────────────────────────────────────────────────────
  logger.info(
    { "[Active Source]": price.source.toUpperCase(), "Price": price.price, "BID": price.bid, "ASK": price.ask, "Spread": spread },
    "[Active Source] Price update"
  );

  // ── Spread warning ─────────────────────────────────────────────────────────
  if (spread > 1.0) {
    logger.warn(
      { "BID": price.bid, "ASK": price.ask, "Spread": spread, source: price.source },
      "WARNING: Spread too wide, likely Asian session"
    );
  }

  // ── Simultaneous sources check ─────────────────────────────────────────────
  // Flag if a different source wrote within the last 500ms (price conflict)
  const otherSources = Object.entries(_lastSourceTime).filter(
    ([src, ts]) => src !== price.source && now - ts < SIMULTANEOUS_WINDOW_MS
  );
  if (otherSources.length > 0) {
    const conflicting = otherSources.map(([src]) => src).join(", ");
    logger.warn(
      { activeSource: price.source, conflictingSources: conflicting, windowMs: SIMULTANEOUS_WINDOW_MS },
      `ERROR: Multiple sources active simultaneously! Conflict: ${conflicting} vs ${price.source} — this causes price jumps`
    );
  }
  _lastSourceTime[price.source] = now;

  _prevPrice = prevPrice;
  _latestPrice = price;
  _tickHistory.push(price);
  if (_tickHistory.length > TICK_BUFFER_SIZE) _tickHistory.shift();
  priceEmitter.emit("price", price);
}

export function getLatestPrice(): LivePrice | null {
  return _latestPrice;
}

export function getTickHistory(): LivePrice[] {
  return [..._tickHistory];
}

export function buildLivePrice(
  data: PriceData,
  spread: number,
  source: LivePrice["source"],
): LivePrice {
  const direction: LivePrice["direction"] =
    _prevPrice === null ? "unchanged"
    : data.price > _prevPrice ? "up"
    : data.price < _prevPrice ? "down"
    : "unchanged";

  return {
    ...data,
    bid:  +(data.price - spread / 2).toFixed(2),
    ask:  +(data.price + spread / 2).toFixed(2),
    spread,
    direction,
    ms: Date.now(),
    source,
  };
}
