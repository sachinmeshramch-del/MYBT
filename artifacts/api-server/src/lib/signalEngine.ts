import { fetchOHLC } from "./goldPrice.js";
import {
  calcEMA,
  calcRSI,
  calcMACD,
  calcATR,
  detectTrend,
} from "./technicalIndicators.js";
import { getAnalyticsSummary, isSmartMode } from "./performanceAnalytics.js";
import { getNewsAnalysis } from "./newsAnalyzer.js";
import { logger } from "./logger.js";
import { db, signalsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

export interface SessionInfo {
  london:  boolean;
  newYork: boolean;
  asian:   boolean;
  active:  string;
  marketOpen: boolean;
}

export interface SignalResult {
  signal:     "LONG" | "SHORT" | "HOLD";
  confidence: number;
  entryPrice: number;
  stopLoss:   number;
  takeProfit: number;
  trend:      "BULLISH" | "BEARISH" | "NEUTRAL";
  reason:     string;
  timestamp:  string;
  tradeDuration:     string;
  cooldownRemaining: number;
  smartMode:         boolean;
  session:           SessionInfo;
  signalStrength:    "STRONG" | "NORMAL" | null;
  spikeCooldownCandles: number; // candles remaining in post-spike cooldown (0 = clear)
  // Dynamic threshold (S/R and Order Block zone detection)
  threshold:       number;  // Effective threshold (40, 45, or 55)
  thresholdReason: string;  // Why the threshold was set to this value
  // Score breakdown (raw values, normalized to 100 for confidence)
  emaScore:      number;  // 0-35
  rsiScore:      number;  // 0-25
  macdScore:     number;  // 0-25
  momentumScore: number;  // 0-15
  fvgScore:      number;  // 0-25
  sweepScore:    number;  // 0-30
  indicators: {
    rsi:           number;
    ema9:          number;
    ema21:         number;
    macdLine:      number;
    macdSignal:    number;
    macdHistogram: number;
    atr:           number;
    trend5m: "BULLISH" | "BEARISH" | "NEUTRAL";
    trend1m: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
}

interface LastSignalState {
  signal:    "LONG" | "SHORT" | "HOLD";
  price:     number;
  timestamp: number;
}

export interface OHLCCandle {
  time?: number; // Unix seconds — used to detect duplicate spike candles
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface FVGZone {
  type: "BULLISH" | "BEARISH";
  low:  number;
  high: number;
}

let lastSignalState: LastSignalState | null = null;
let cachedSignal:    SignalResult | null = null;
let lastSignalTime = 0;
let _signalPersisted = false;

/** Returns true if the current cached signal has already been written to the DB. */
export function isSignalPersisted(): boolean { return _signalPersisted; }
/** Called by the route layer after a successful DB insert. */
export function markSignalPersisted(): void  { _signalPersisted = true; }

// ── Post-spike cooldown state ─────────────────────────────────────────────
let spikeDetectedAt = 0;
let lastSpikeCandleTime = 0; // tracks which candle triggered the spike to avoid re-triggering on the same candle
const SPIKE_ATR_MULT       = 1.5;   // body must exceed ATR × this
const SPIKE_COOLDOWN_COUNT = 2;     // candles to block after a spike
const CANDLE_5M_MS         = 300_000; // 5 min in ms

// ── Scalping constants ────────────────────────────────────────────────────
const SIGNAL_CACHE_TTL   = 60_000;   // 1 minute
const COOLDOWN_MS        = 900_000;  // 15 minutes between signals
const MIN_CONF_NORMAL    = 55;       // Default confidence threshold
const MIN_CONF_STRONG    = 75;
const MIN_PRICE_MOVE_PCT = 0.001;    // 0.1% to override cooldown
const MAX_RAW_SCORE      = 155;      // 35+25+25+15+25+30

// ── S/R Zone Detection (simple swing highs/lows) ─────────────────────────
interface SRZones {
  swingHighs: number[];
  swingLows:  number[];
}

function detectSRZones(candles: OHLCCandle[]): SRZones {
  const swingHighs: number[] = [];
  const swingLows:  number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i]!.high > candles[i - 1]!.high) swingHighs.push(candles[i]!.high);
    if (candles[i]!.low  < candles[i - 1]!.low)  swingLows.push(candles[i]!.low);
  }
  return { swingHighs, swingLows };
}

// ── Simple Order Block Detection (from prompt spec) ───────────────────────
interface SimpleOrderBlock {
  type:  "BULLISH" | "BEARISH";
  level: number;
}

function detectSimpleOrderBlocks(candles: OHLCCandle[]): SimpleOrderBlock[] {
  const blocks: SimpleOrderBlock[] = [];
  for (let i = 2; i < candles.length; i++) {
    if (
      candles[i - 2]!.high > candles[i - 1]!.high &&
      candles[i - 1]!.high > candles[i]!.high
    ) {
      blocks.push({ type: "BULLISH", level: candles[i - 2]!.high });
    }
    if (
      candles[i - 2]!.low < candles[i - 1]!.low &&
      candles[i - 1]!.low < candles[i]!.low
    ) {
      blocks.push({ type: "BEARISH", level: candles[i - 2]!.low });
    }
  }
  return blocks;
}

// ── Dynamic Threshold Based on Location ──────────────────────────────────
// KEY CHANGE: Instead of adding score bonuses, REDUCE the threshold
// when price is at high-probability S/R or OB zones.
const SR_ZONE_PROXIMITY  = 2;  // Gold points — price must be within this of zone
const OB_ZONE_PROXIMITY  = 2;  // Gold points — price must be within this of OB level
const THRESHOLD_DEFAULT  = 55; // Default — not at any notable zone
const THRESHOLD_SR_ZONE  = 45; // Reduced at support or resistance zone
const THRESHOLD_OB_ZONE  = 40; // Most reduced — at order block (highest probability)

interface ThresholdResult {
  threshold: number;
  reason:    string;
}

function determineThreshold(
  price:   number,
  srZones: SRZones,
  obZones: SimpleOrderBlock[],
  baseConf: number,
): ThresholdResult {
  // Order blocks have highest priority (checked first)
  for (const block of obZones.slice(-20)) { // check last 20 OBs
    if (Math.abs(price - block.level) < OB_ZONE_PROXIMITY) {
      return {
        threshold: THRESHOLD_OB_ZONE,
        reason:    `${block.type} OB zone (need ${THRESHOLD_OB_ZONE}%, have ${baseConf}%)`,
      };
    }
  }

  // Support zone
  if (srZones.swingLows.length > 0) {
    const nearestSupport = Math.min(...srZones.swingLows);
    if (
      price > nearestSupport - SR_ZONE_PROXIMITY &&
      price < nearestSupport + SR_ZONE_PROXIMITY
    ) {
      return {
        threshold: THRESHOLD_SR_ZONE,
        reason:    `Support zone @ ${nearestSupport.toFixed(2)} (need ${THRESHOLD_SR_ZONE}%, have ${baseConf}%)`,
      };
    }
  }

  // Resistance zone
  if (srZones.swingHighs.length > 0) {
    const nearestResistance = Math.max(...srZones.swingHighs);
    if (
      price > nearestResistance - SR_ZONE_PROXIMITY &&
      price < nearestResistance + SR_ZONE_PROXIMITY
    ) {
      return {
        threshold: THRESHOLD_SR_ZONE,
        reason:    `Resistance zone @ ${nearestResistance.toFixed(2)} (need ${THRESHOLD_SR_ZONE}%, have ${baseConf}%)`,
      };
    }
  }

  return {
    threshold: THRESHOLD_DEFAULT,
    reason:    `Default (need ${THRESHOLD_DEFAULT}%, have ${baseConf}%)`,
  };
}

// ── Session detection ─────────────────────────────────────────────────────
function getCurrentSession(): SessionInfo {
  const now  = new Date();
  const day  = now.getUTCDay();   // 0 = Sun, 6 = Sat
  const h    = now.getUTCHours();

  // Gold forex market is closed: all of Saturday + Sunday before 22:00 UTC
  const isWeekend = day === 6 || (day === 0 && h < 22);

  const london  = !isWeekend && h >= 7  && h < 17;
  const newYork = !isWeekend && h >= 13 && h < 22;
  const asian   = !isWeekend && (h >= 22 || h < 7);

  const active =
    isWeekend         ? "Market Closed" :
    london && newYork ? "London / New York" :
    london            ? "London" :
    newYork           ? "New York" :
    asian             ? "Asian" :
    "Off-hours";

  return { london, newYork, asian, active, marketOpen: !isWeekend };
}

function overallTrend(
  t5m: "BULLISH" | "BEARISH" | "NEUTRAL",
  t1m: "BULLISH" | "BEARISH" | "NEUTRAL",
): "BULLISH" | "BEARISH" | "NEUTRAL" {
  const score =
    (t5m === "BULLISH" ? 1 : t5m === "BEARISH" ? -1 : 0) +
    (t1m === "BULLISH" ? 1 : t1m === "BEARISH" ? -1 : 0);
  if (score >= 1)  return "BULLISH";
  if (score <= -1) return "BEARISH";
  return "NEUTRAL";
}

// ── FVG Detection ─────────────────────────────────────────────────────────
export function detectFVGZones(candles: OHLCCandle[]): FVGZone[] {
  const zones: FVGZone[] = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2]!; // 2 bars before
    const c2 = candles[i]!;     // current bar

    // Bullish FVG: gap up — the top of candle[i-2] is below the bottom of candle[i]
    if (c0.high < c2.low) {
      zones.push({ type: "BULLISH", low: c0.high, high: c2.low });
    }
    // Bearish FVG: gap down — the bottom of candle[i-2] is above the top of candle[i]
    else if (c0.low > c2.high) {
      zones.push({ type: "BEARISH", low: c2.high, high: c0.low });
    }
  }
  return zones.slice(-10); // keep only last 10 FVG zones
}

export function getFVGScore(price: number, zones: FVGZone[], direction: "LONG" | "SHORT"): number {
  for (const zone of zones) {
    if (direction === "LONG"  && zone.type === "BULLISH" && price >= zone.low && price <= zone.high) return 25;
    if (direction === "SHORT" && zone.type === "BEARISH" && price >= zone.low && price <= zone.high) return 25;
  }
  return 0;
}

// ── Liquidity Sweep Detection ─────────────────────────────────────────────
export function detectLiquiditySweep(candles: OHLCCandle[]): "BULLISH" | "BEARISH" | null {
  // Check the last 3 completed bars for a sweep
  const start = Math.max(1, candles.length - 4);
  for (let i = candles.length - 2; i >= start; i--) {
    const candle = candles[i]!;
    const prev   = candles[i - 1]!;
    const body   = Math.abs(candle.close - candle.open);
    const wick   = candle.high - candle.low;
    // Guard against doji (body ≈ 0) which would produce Infinity
    const wickRatio = body > 0.01 ? wick / body : wick > 0 ? 999 : 0;

    // Bullish sweep: wick dips below prev low, then price closes back above it
    if (candle.low < prev.low && candle.close > prev.low && wickRatio > 1.5) {
      return "BULLISH";
    }
    // Bearish sweep: wick spikes above prev high, then price closes back below it
    if (candle.high > prev.high && candle.close < prev.high && wickRatio > 1.5) {
      return "BEARISH";
    }
  }
  return null;
}

export async function generateSignal(currentPrice: number): Promise<SignalResult> {
  const now = Date.now();
  const sinceLastSignal    = now - lastSignalTime;
  const cooldownRemaining  = Math.max(0, Math.ceil((COOLDOWN_MS - sinceLastSignal) / 1000));
  const smartMode = isSmartMode();
  const session   = getCurrentSession();

  // ── Market-closed guard (weekends: Sat all day + Sun before 22:00 UTC) ────
  if (!session.marketOpen) {
    return {
      signal:               "HOLD",
      confidence:           0,
      entryPrice:           +currentPrice.toFixed(2),
      stopLoss:             +(currentPrice - 10.38).toFixed(2),
      takeProfit:           +(currentPrice + 25.95).toFixed(2),
      trend:                "NEUTRAL",
      reason:               "HOLD – Market closed (weekend) · Opens Sunday 22:00 UTC",
      timestamp:            new Date().toISOString(),
      tradeDuration:        "—",
      cooldownRemaining:    0,
      smartMode,
      session,
      signalStrength:       null,
      spikeCooldownCandles: 0,
      threshold:            THRESHOLD_DEFAULT,
      thresholdReason:      `Default (need ${THRESHOLD_DEFAULT}%, have 0%)`,
      emaScore:      0,
      rsiScore:      0,
      macdScore:     0,
      momentumScore: 0,
      fvgScore:      0,
      sweepScore:    0,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
    };
  }

  // Compute fresh spike cooldown status on every call (time-based, no candles needed)
  const _spikeElapsed = now - spikeDetectedAt;
  const _spikeCdMs    = SPIKE_COOLDOWN_COUNT * CANDLE_5M_MS;
  const freshSpikeCooldownCandles = (spikeDetectedAt > 0 && _spikeElapsed < _spikeCdMs)
    ? Math.ceil((_spikeCdMs - _spikeElapsed) / CANDLE_5M_MS)
    : 0;

  // ── SPIKE GATE (runs before cache, before everything) ─────────────────────
  // Must fire here so that cached signals from before the spike are also blocked
  logger.info({ spikeCooldownActive: freshSpikeCooldownCandles > 0, candlesRemaining: freshSpikeCooldownCandles }, "[SpikeGuard] Cooldown active");
  if (freshSpikeCooldownCandles > 0) {
    logger.warn({ candlesRemaining: freshSpikeCooldownCandles }, `[SpikeGuard] Signals blocked: true (${freshSpikeCooldownCandles} candle${freshSpikeCooldownCandles !== 1 ? "s" : ""} remaining)`);
    const spikeReason = `HOLD – Spike cooldown (${freshSpikeCooldownCandles} candle${freshSpikeCooldownCandles !== 1 ? "s" : ""} remaining) · Signals blocked until spike settles`;
    const base = cachedSignal ?? {
      confidence: 0, entryPrice: +currentPrice.toFixed(2),
      stopLoss: +(currentPrice - 10.38).toFixed(2), takeProfit: +(currentPrice + 25.95).toFixed(2),
      trend: "NEUTRAL" as const, tradeDuration: "5-30 minutes",
      signalStrength: null, emaScore: 0, rsiScore: 0, macdScore: 0,
      momentumScore: 0, fvgScore: 0, sweepScore: 0,
      threshold: THRESHOLD_DEFAULT, thresholdReason: `Default (need ${THRESHOLD_DEFAULT}%, have 0%)`,
      indicators: { rsi: 50, ema9: currentPrice, ema21: currentPrice, macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3, trend5m: "NEUTRAL" as const, trend1m: "NEUTRAL" as const },
    };
    return {
      ...base,
      signal:               "HOLD",
      reason:               spikeReason,
      timestamp:            new Date().toISOString(),
      cooldownRemaining,
      smartMode,
      session,
      spikeCooldownCandles: freshSpikeCooldownCandles,
    };
  }

  if (cachedSignal && sinceLastSignal < SIGNAL_CACHE_TTL) {
    return { ...cachedSignal, cooldownRemaining, smartMode, session, spikeCooldownCandles: 0 };
  }

  const analytics = await getAnalyticsSummary();
  const smartBoost = smartMode && analytics.sufficientData ? 5 : 0;

  try {
    // ── Fetch 5m (primary) and 1m (entry refinement) ─────────────────────
    const [candles5m, candles1m] = await Promise.all([
      fetchOHLC("5m"),
      fetchOHLC("1m"),
    ]);

    // Use only CLOSED candles for indicator math — the last candle is still
    // forming and its close changes every tick, causing phantom signals.
    // We keep the full array for spike detection (which explicitly checks both).
    const closedCandles5m = candles5m.slice(0, -1);
    const closedCandles1m = candles1m.slice(0, -1);

    const closes5m = closedCandles5m.map(c => c.close);
    const closes1m = closedCandles1m.map(c => c.close);

    // ── EMAs on 5m ────────────────────────────────────────────────────────
    const ema9_5m  = calcEMA(closes5m, 9);
    const ema21_5m = calcEMA(closes5m, 21);
    const ema9  = ema9_5m[ema9_5m.length - 1]   ?? currentPrice;
    const ema21 = ema21_5m[ema21_5m.length - 1] ?? currentPrice;

    // Detect fresh EMA cross (within last 3 bars)
    let freshCross: "BULLISH" | "BEARISH" | null = null;
    if (ema9_5m.length >= 4 && ema21_5m.length >= 4) {
      const prevE9  = ema9_5m[ema9_5m.length - 4];
      const prevE21 = ema21_5m[ema21_5m.length - 4];
      if (prevE9 !== undefined && prevE21 !== undefined) {
        if (prevE9 <= prevE21 && ema9  >  ema21) freshCross = "BULLISH";
        if (prevE9 >= prevE21 && ema9  <  ema21) freshCross = "BEARISH";
      }
    }

    // ── RSI (14) on 5m ────────────────────────────────────────────────────
    const rsi5mArr = calcRSI(closes5m, 14);
    const rsi      = rsi5mArr[rsi5mArr.length - 1] ?? 50;

    // ── MACD (12,26,9) on 5m ──────────────────────────────────────────────
    const { macdLine, signalLine, histogram } = calcMACD(closes5m);
    const macdVal      = macdLine[macdLine.length - 1]    ?? 0;
    const macdSig      = signalLine[signalLine.length - 1] ?? 0;
    const macdHist     = histogram[histogram.length - 1]   ?? 0;
    const macdPrevHist = histogram[histogram.length - 2]   ?? 0;
    const macdBullish  = macdHist > 0 && macdHist > macdPrevHist;
    const macdBearish  = macdHist < 0 && macdHist < macdPrevHist;
    const macdCrossBull = macdPrevHist <= 0 && macdHist > 0;
    const macdCrossBear = macdPrevHist >= 0 && macdHist < 0;

    // ── ATR (14) on 5m ────────────────────────────────────────────────────
    const atrArr = calcATR(candles5m, 14);
    const atr    = atrArr[atrArr.length - 1] ?? 3;

    // ── Post-spike cooldown detection ─────────────────────────────────────
    // Check BOTH the forming candle (index -1) AND the last completed candle
    // (index -2). A spike firing at 11:02 on a 5m chart started at 11:00 is
    // still forming — index -2 won't show it yet, so we'd miss it entirely.
    // ── Candle index verification log ─────────────────────────────────────
    const closedCandle   = candles5m[candles5m.length - 2];
    const formingCandle  = candles5m[candles5m.length - 1];
    logger.info(
      {
        "Using candle index -2 (closed) close":  closedCandle  ? +closedCandle.close.toFixed(2)  : null,
        "Using candle index -1 (forming) close": formingCandle ? +formingCandle.close.toFixed(2) : null,
        totalCandles5m: candles5m.length,
      },
      "Candle index check"
    );

    const spikeThreshold = atr * SPIKE_ATR_MULT;
    const candidates = [
      candles5m[candles5m.length - 1], // forming candle — spike in progress
      candles5m[candles5m.length - 2], // last completed candle
    ].filter((c): c is OHLCCandle => !!c);

    for (const candle of candidates) {
      const body = Math.abs(candle.close - candle.open);
      const spikeDetected = body > spikeThreshold;
      logger.info(
        { "Candle body (pts)": +body.toFixed(2), "ATR (pts)": +atr.toFixed(2), "ATR×1.5 (pts)": +spikeThreshold.toFixed(2), "Spike detected": spikeDetected },
        "Spike check"
      );
      if (spikeDetected) {
        const candleTime = candle.time ?? 0;
        if (candleTime !== lastSpikeCandleTime) {
          // Genuinely new spike candle — start a fresh cooldown window
          spikeDetectedAt     = now;
          lastSpikeCandleTime = candleTime;
          cachedSignal        = null; // discard pre-spike cached signal
          logger.warn(
            { body: +body.toFixed(2), atr: +atr.toFixed(2), threshold: +spikeThreshold.toFixed(2), blockingMinutes: 10, candleTime },
            "SPIKE COOLDOWN ACTIVATED — Blocking signals for 10 minutes"
          );
        } else {
          // Same candle is still in the OHLC window — do NOT reset the timer
          logger.info(
            { candleTime, remainingMs: (SPIKE_COOLDOWN_COUNT * CANDLE_5M_MS) - (now - spikeDetectedAt) },
            "[SpikeGuard] Same spike candle re-detected — cooldown timer preserved, NOT reset"
          );
        }
        break; // one spike is enough to activate cooldown
      }
    }

    const spikeElapsedMs   = now - spikeDetectedAt;
    const spikeCooldownMs  = SPIKE_COOLDOWN_COUNT * CANDLE_5M_MS;
    const inSpikeCooldown  = spikeDetectedAt > 0 && spikeElapsedMs < spikeCooldownMs;
    const spikeCooldownCandles = inSpikeCooldown
      ? Math.ceil((spikeCooldownMs - spikeElapsedMs) / CANDLE_5M_MS)
      : 0;

    // ── 1m trend (entry confirmation) ─────────────────────────────────────
    const ema9_1m  = calcEMA(closes1m, 9);
    const ema21_1m = calcEMA(closes1m, 21);
    const trend1m  = detectTrend(ema9_1m, ema21_1m);
    const trend5m  = detectTrend(ema9_5m, ema21_5m);

    // ── FVG Detection (closed 5m candles only) ───────────────────────────
    const fvgZones  = detectFVGZones(closedCandles5m);

    // ── Liquidity Sweep Detection (closed 5m candles only) ───────────────
    const sweepDir  = detectLiquiditySweep(closedCandles5m);

    // ── S/R Zone + Order Block Detection (for dynamic threshold) ─────────
    const srZones  = detectSRZones(closedCandles5m);
    const obZones  = detectSimpleOrderBlocks(closedCandles5m);

    // ── Scoring Engine ────────────────────────────────────────────────────
    // LONG scores
    let longEmaScore  = 0;
    let longRsiScore  = 0;
    let longMacdScore = 0;
    let longMomentum  = 0;

    if (ema9 > ema21) {
      longEmaScore = freshCross === "BULLISH" ? 35 : 20;
    }
    if      (rsi >= 40 && rsi <= 58) longRsiScore = 25;
    else if (rsi >= 35 && rsi <  40) longRsiScore = 18;
    else if (rsi >  58 && rsi <= 65) longRsiScore = 12;

    if      (macdCrossBull)    longMacdScore = 25;
    else if (macdBullish)      longMacdScore = 20;
    else if (macdHist > 0)     longMacdScore = 10;

    if      (trend1m === "BULLISH") longMomentum = 15;
    else if (trend1m === "NEUTRAL") longMomentum =  5;

    // SHORT scores
    let shortEmaScore  = 0;
    let shortRsiScore  = 0;
    let shortMacdScore = 0;
    let shortMomentum  = 0;

    if (ema9 < ema21) {
      shortEmaScore = freshCross === "BEARISH" ? 35 : 20;
    }
    if      (rsi >= 42 && rsi <= 60) shortRsiScore = 25;
    else if (rsi >  60 && rsi <= 65) shortRsiScore = 18;
    else if (rsi >= 35 && rsi <  42) shortRsiScore = 12;

    if      (macdCrossBear)    shortMacdScore = 25;
    else if (macdBearish)      shortMacdScore = 20;
    else if (macdHist < 0)     shortMacdScore = 10;

    if      (trend1m === "BEARISH") shortMomentum = 15;
    else if (trend1m === "NEUTRAL") shortMomentum =  5;

    // FVG scores (direction-dependent)
    const longFvgScore  = getFVGScore(currentPrice, fvgZones, "LONG");
    const shortFvgScore = getFVGScore(currentPrice, fvgZones, "SHORT");

    // Liquidity sweep scores (direction-dependent)
    const longSweepScore  = sweepDir === "BULLISH" ? 30 : 0;
    const shortSweepScore = sweepDir === "BEARISH" ? 30 : 0;

    // Raw totals (0-155)
    const longRaw  = longEmaScore  + longRsiScore  + longMacdScore  + longMomentum  + longFvgScore  + longSweepScore;
    const shortRaw = shortEmaScore + shortRsiScore + shortMacdScore + shortMomentum + shortFvgScore + shortSweepScore;

    // Normalize to 0-100 for display and threshold comparison
    const longNorm  = Math.round((longRaw  / MAX_RAW_SCORE) * 100);
    const shortNorm = Math.round((shortRaw / MAX_RAW_SCORE) * 100);

    // ── Dynamic Threshold (S/R + Order Block zone reduction) ─────────────
    const bestNorm = Math.max(longNorm, shortNorm);
    const { threshold: dynamicThreshold, reason: zoneReason } =
      determineThreshold(currentPrice, srZones, obZones, bestNorm);
    // SmartMode raises the threshold by 5 on top of whatever zone gives us
    const baseEffThreshold = dynamicThreshold + smartBoost;

    // ── News / Fundamental Analysis ───────────────────────────────────────
    const news = getNewsAnalysis();
    const newsAdj = news.thresholdAdjustment;
    // News independently lowers threshold for the aligned direction.
    // Take min (most permissive) of zone threshold and news threshold.
    const longThreshold  = Math.min(baseEffThreshold, newsAdj.long  + smartBoost);
    const shortThreshold = Math.min(baseEffThreshold, newsAdj.short + smartBoost);
    // For HOLD display: use minimum of the two directional thresholds
    const effectiveThreshold = Math.min(longThreshold, shortThreshold);
    // Annotate threshold reason with news context if news had an effect
    const newsAffected = longThreshold < baseEffThreshold || shortThreshold < baseEffThreshold || newsAdj.blockLong || newsAdj.blockShort;
    const thresholdReason = newsAffected
      ? `${zoneReason} · ${news.label} (${news.bias >= 0 ? "+" : ""}${news.bias})`
      : zoneReason;

    // Log news analysis factors
    logger.info(
      { bias: news.bias, label: news.label, action: news.action, longThr: longThreshold, shortThr: shortThreshold, blockLong: newsAdj.blockLong, blockShort: newsAdj.blockShort },
      `[NEWS BIAS] Overall Bias: ${news.bias >= 0 ? "+" : ""}${news.bias} (${news.label}) — ${news.action}`
    );
    for (const f of news.factors) {
      logger.info(
        { score: `${f.score >= 0 ? "+" : ""}${f.score}`, weight: `${Math.round(f.weight * 100)}%`, state: f.label },
        `[${f.key.toUpperCase()}] ${f.score >= 0 ? "+" : ""}${f.score} → ${f.label}`
      );
    }

    // ── Determine direction ───────────────────────────────────────────────
    let direction: "LONG" | "SHORT" | "HOLD" = "HOLD";

    if (!newsAdj.blockLong && longNorm >= shortNorm && longNorm >= longThreshold) {
      direction = "LONG";
    } else if (!newsAdj.blockShort && shortNorm > longNorm && shortNorm >= shortThreshold) {
      direction = "SHORT";
    }

    // Always show the dominant direction's scores (even for HOLD)
    const dominant = longNorm >= shortNorm ? "LONG" : "SHORT";
    const emaScore      = dominant === "LONG" ? longEmaScore  : shortEmaScore;
    const rsiScore      = dominant === "LONG" ? longRsiScore  : shortRsiScore;
    const macdScore     = dominant === "LONG" ? longMacdScore : shortMacdScore;
    const momentumScore = dominant === "LONG" ? longMomentum  : shortMomentum;
    const fvgScore      = dominant === "LONG" ? longFvgScore  : shortFvgScore;
    const sweepScore    = dominant === "LONG" ? longSweepScore : shortSweepScore;

    const confidence = direction !== "HOLD"
      ? (direction === "LONG" ? longNorm : shortNorm)
      : Math.max(longNorm, shortNorm);

    const signalStrength: "STRONG" | "NORMAL" | null =
      direction !== "HOLD" && confidence >= MIN_CONF_STRONG ? "STRONG" :
      direction !== "HOLD" && confidence >= MIN_CONF_NORMAL ? "NORMAL" :
      null;

    // ── Cooldown Guard ────────────────────────────────────────────────────
    const inCooldown     = sinceLastSignal < COOLDOWN_MS;
    const priceMoved     = lastSignalState
      ? Math.abs(currentPrice - lastSignalState.price) / lastSignalState.price >= MIN_PRICE_MOVE_PCT
      : true;
    const oppositeSignal = lastSignalState &&
      direction !== "HOLD" && direction !== lastSignalState.signal;

    let finalSignal = direction;
    if (finalSignal !== "HOLD" && inCooldown && !priceMoved && !oppositeSignal) {
      finalSignal = "HOLD";
    }
    // Post-spike cooldown overrides all — no signals until spike settles
    if (finalSignal !== "HOLD" && inSpikeCooldown) {
      finalSignal = "HOLD";
    }
    // Log final signal fire decision with news context
    if (finalSignal !== "HOLD") {
      const usedThr = finalSignal === "LONG" ? longThreshold : shortThreshold;
      logger.info(
        { signal: finalSignal, confidence, threshold: usedThr, newsBias: news.bias, newsLabel: news.label },
        `[SIGNAL] Tech: ${confidence}% > Threshold: ${usedThr}% = FIRE ✅ | News: ${news.label} (${news.bias >= 0 ? "+" : ""}${news.bias})`
      );
    }

    // ── SL / TP (ATR × 3.0 for SL, R:R 1:2.5 for TP) ────────────────────
    const slDist = +(atr * 3.0).toFixed(2);
    const tpDist = +(slDist * 2.5).toFixed(2);
    let stopLoss:   number;
    let takeProfit: number;

    if (finalSignal === "LONG") {
      stopLoss   = +(currentPrice - slDist).toFixed(2);
      takeProfit = +(currentPrice + tpDist).toFixed(2);
    } else if (finalSignal === "SHORT") {
      stopLoss   = +(currentPrice + slDist).toFixed(2);
      takeProfit = +(currentPrice - tpDist).toFixed(2);
    } else {
      stopLoss   = +(currentPrice - slDist).toFixed(2);
      takeProfit = +(currentPrice + tpDist).toFixed(2);
    }

    logger.info(
      { signal: finalSignal, entry: +currentPrice.toFixed(2), atr: +atr.toFixed(2), slDist, tpDist, stopLoss, takeProfit, rr: "1:2.5" },
      "[SIGNAL] SL/TP calculated"
    );

    // ── Reason string ─────────────────────────────────────────────────────
    const sessionNote = `[${session.active}]`;
    let reason: string;

    if (finalSignal !== "HOLD" && direction !== "HOLD") {
      const parts: string[] = [];
      if      (emaScore >= 35) parts.push(`EMA9/21 ${freshCross ? "CROSSED" : "aligned"}`);
      else if (emaScore >= 20) parts.push(`EMA9 ${finalSignal === "LONG" ? ">" : "<"} EMA21`);
      if      (rsiScore >= 25) parts.push(`RSI ${rsi.toFixed(1)} optimal`);
      else if (rsiScore >= 12) parts.push(`RSI ${rsi.toFixed(1)}`);
      if      (macdScore >= 25) parts.push(`MACD ${finalSignal === "LONG" ? "bull" : "bear"} cross`);
      else if (macdScore >= 20) parts.push(`MACD ${finalSignal === "LONG" ? "bull" : "bear"}`);
      if (momentumScore >= 15) parts.push("1m confirms");
      if (fvgScore  > 0) parts.push("FVG entry zone");
      if (sweepScore > 0) parts.push("Liquidity swept");
      reason = `${signalStrength} ${finalSignal} ${sessionNote} [conf:${confidence}%] — ${parts.join(" · ")}`;
    } else if (direction !== "HOLD" && inSpikeCooldown) {
      reason = `HOLD – Spike cooldown (${spikeCooldownCandles} candle${spikeCooldownCandles !== 1 ? "s" : ""} remaining) · ${direction} ${Math.max(longNorm, shortNorm)}% queued after spike settles`;
    } else if (direction !== "HOLD" && inCooldown) {
      const mLeft = Math.ceil(cooldownRemaining / 60);
      reason = `HOLD – cooldown ${mLeft}m remaining · ${direction} signal (${Math.max(longNorm, shortNorm)}% conf) ready`;
    } else {
      const bestDir  = longNorm >= shortNorm ? "LONG" : "SHORT";
      const bestConf = Math.max(longNorm, shortNorm);
      reason = `HOLD – Waiting for confluence ${sessionNote} · Current: ${bestConf}% (need ${effectiveThreshold}% — ${thresholdReason})`;
    }

    if (finalSignal !== "HOLD") {
      lastSignalState = { signal: finalSignal, price: currentPrice, timestamp: now };
      lastSignalTime  = now;
    }

    const result: SignalResult = {
      signal:            finalSignal,
      confidence,
      entryPrice:        +currentPrice.toFixed(2),
      stopLoss,
      takeProfit,
      trend:             overallTrend(trend5m, trend1m),
      reason,
      timestamp:         new Date().toISOString(),
      tradeDuration:     "5-30 minutes",
      cooldownRemaining: finalSignal !== "HOLD" ? 0 : cooldownRemaining,
      smartMode,
      session,
      signalStrength,
      spikeCooldownCandles,
      threshold:         finalSignal === "LONG" ? longThreshold : finalSignal === "SHORT" ? shortThreshold : effectiveThreshold,
      thresholdReason,
      emaScore,
      rsiScore,
      macdScore,
      momentumScore,
      fvgScore,
      sweepScore,
      indicators: {
        rsi:           +rsi.toFixed(2),
        ema9:          +ema9.toFixed(2),
        ema21:         +ema21.toFixed(2),
        macdLine:      +macdVal.toFixed(4),
        macdSignal:    +macdSig.toFixed(4),
        macdHistogram: +macdHist.toFixed(4),
        atr:           +atr.toFixed(2),
        trend5m,
        trend1m,
      },
    };

    cachedSignal = result;
    _signalPersisted = false; // reset so the route layer persists this new signal exactly once
    return result;

  } catch (err) {
    logger.error({ err }, "Scalp signal generation failed");

    const fallback: SignalResult = {
      signal:     "HOLD",
      confidence: 0,
      entryPrice: +currentPrice.toFixed(2),
      stopLoss:   +(currentPrice - 10.38).toFixed(2),
      takeProfit: +(currentPrice + 25.95).toFixed(2),
      trend:      "NEUTRAL",
      reason:     "HOLD – Signal generation failed; using safe defaults",
      timestamp:  new Date().toISOString(),
      tradeDuration:     "5-30 minutes",
      cooldownRemaining,
      smartMode,
      session,
      signalStrength:    null,
      spikeCooldownCandles: 0,
      threshold:         THRESHOLD_DEFAULT,
      thresholdReason:   `Default (need ${THRESHOLD_DEFAULT}%, have 0%)`,
      emaScore:      0,
      rsiScore:      0,
      macdScore:     0,
      momentumScore: 0,
      fvgScore:      0,
      sweepScore:    0,
      indicators: {
        rsi: 50, ema9: currentPrice, ema21: currentPrice,
        macdLine: 0, macdSignal: 0, macdHistogram: 0, atr: 3,
        trend5m: "NEUTRAL", trend1m: "NEUTRAL",
      },
    };
    return fallback;
  }
}

// ── Restore cooldown from DB on server start ──────────────────────────────
// Prevents a server restart from resetting the 15-min inter-signal cooldown.
export async function initSignalCooldown(): Promise<void> {
  try {
    const [last] = await db
      .select({ createdAt: signalsTable.createdAt })
      .from(signalsTable)
      .orderBy(desc(signalsTable.createdAt))
      .limit(1);
    if (last) {
      lastSignalTime = last.createdAt.getTime();
      logger.info(
        { lastSignalAt: new Date(lastSignalTime).toISOString() },
        "Signal cooldown restored from DB",
      );
    }
  } catch (err) {
    logger.warn({ err }, "Failed to restore signal cooldown from DB — starting fresh");
  }
}
