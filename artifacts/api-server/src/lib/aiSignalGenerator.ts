import Anthropic from "@anthropic-ai/sdk";
import { fetchOHLC } from "./goldPrice.js";
import { calcEMA, calcRSI, calcMACD, calcATR } from "./technicalIndicators.js";
import { getNewsAnalysis } from "./newsAnalyzer.js";
import { getLatestPrice } from "./priceEvents.js";
import { logger } from "./logger.js";
import { db, signalsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AIAnalysis {
  trend:             string;
  momentum:          string;
  supportResistance: string;
  patterns:          string;
  fundamentals:      string;
  volatility:        string;
  session:           string;
}

export interface AISignalResult {
  decision:            "BUY" | "SHORT" | "WAIT" | "BLOCK";
  confidence:          number;
  entryPrice:          number;
  stopLoss:            number;
  takeProfit:          number;
  riskRewardRatio:     number;
  signalId:            string;
  timestamp:           string;
  analysis:            AIAnalysis;
  keyReasons:          string[];
  risks:               string[];
  alternativeScenario: string;
  nextTrigger:         string;
  source:              "claude" | "mock";
  model:               string;
}

interface CollectedData {
  price:       number;
  ema9:        number;
  ema21:       number;
  rsi:         number;
  macdLine:    number;
  macdSig:     number;
  macdHist:    number;
  atr:         number;
  swingHighs:  number[];
  swingLows:   number[];
  newsBias:    number;
  newsLabel:   string;
  newsAction:  string;
  newsFactors: string;
  session:     string;
  recentSignals: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL          = "claude-3-5-sonnet-20241022";
const MAX_TOKENS     = 1024;
const CACHE_TTL_MS   = 5 * 60 * 1000;   // 5 minutes
const API_TIMEOUT_MS = 15_000;

// ── Cache ─────────────────────────────────────────────────────────────────────

let _cached:   AISignalResult | null = null;
let _cachedAt  = 0;

// ── Session helper ────────────────────────────────────────────────────────────

function getSessionName(): string {
  const h = new Date().getUTCHours();
  if (h >= 8  && h < 13) return "London";
  if (h >= 13 && h < 16) return "London/NY Overlap (high liquidity)";
  if (h >= 16 && h < 21) return "New York";
  if (h >= 21 || h < 1)  return "NY/Asia Transition";
  return "Asian";
}

// ── Data collection ───────────────────────────────────────────────────────────

async function collectMarketData(): Promise<CollectedData> {
  const livePrice = getLatestPrice()?.price ?? 0;

  // Attempt OHLC fetch — if market is closed/stale, use live price with defaults
  let candles5m: Awaited<ReturnType<typeof fetchOHLC>> = [];
  try {
    candles5m = await fetchOHLC("5m");
  } catch {
    logger.warn("[AISignal] OHLC unavailable — using live price with default indicators");
  }

  const [news, recentRows] = await Promise.all([
    Promise.resolve(getNewsAnalysis()),
    db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(3),
  ]);

  const closed = candles5m.slice(0, -1);
  const closes = closed.map(c => c.close);
  const price  = livePrice || (closed[closed.length - 1]?.close ?? 0);

  // EMAs
  const ema9arr  = calcEMA(closes, 9);
  const ema21arr = calcEMA(closes, 21);
  const ema9  = ema9arr[ema9arr.length - 1]   ?? price;
  const ema21 = ema21arr[ema21arr.length - 1] ?? price;

  // RSI
  const rsiArr = calcRSI(closes, 14);
  const rsi    = rsiArr[rsiArr.length - 1] ?? 50;

  // MACD
  const { macdLine, signalLine, histogram } = calcMACD(closes);
  const macdLineVal  = macdLine[macdLine.length - 1]    ?? 0;
  const macdSigVal   = signalLine[signalLine.length - 1] ?? 0;
  const macdHistVal  = histogram[histogram.length - 1]   ?? 0;

  // ATR
  const atrArr = calcATR(candles5m, 14);
  const atr    = atrArr[atrArr.length - 1] ?? 3;

  // Swing highs/lows (last 20 bars)
  const recent = closed.slice(-20);
  const swingHighs = recent.map(c => c.high).sort((a, b) => b - a).slice(0, 3);
  const swingLows  = recent.map(c => c.low).sort((a, b) => a - b).slice(0, 3);

  // News
  const newsFactors = news.factors
    .map(f => `${f.name} (${f.weight * 100}%wt): ${f.label} = ${f.score >= 0 ? "+" : ""}${f.score}`)
    .join("; ");

  // Recent signal context
  const recentSignals = recentRows.length > 0
    ? recentRows.map(r => `${r.signal} @ $${r.entryPrice} [${r.tradeStatus ?? "RUNNING"}]`).join(", ")
    : "No recent signals";

  return {
    price, ema9, ema21, rsi,
    macdLine: macdLineVal, macdSig: macdSigVal, macdHist: macdHistVal,
    atr, swingHighs, swingLows,
    newsBias:    news.bias,
    newsLabel:   news.label,
    newsAction:  news.action,
    newsFactors,
    session:     getSessionName(),
    recentSignals,
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(d: CollectedData): string {
  const emaTrend = d.ema9 > d.ema21 ? "BULLISH (EMA9 > EMA21)" : d.ema9 < d.ema21 ? "BEARISH (EMA9 < EMA21)" : "FLAT";
  const rsiState = d.rsi > 70 ? "OVERBOUGHT" : d.rsi < 30 ? "OVERSOLD" : d.rsi >= 55 ? "Bullish range" : d.rsi <= 45 ? "Bearish range" : "Neutral";
  const macdState = d.macdHist > 0 ? "Positive (bullish)" : d.macdHist < 0 ? "Negative (bearish)" : "Zero";
  const nearSup = d.swingLows[0] ? `$${d.swingLows[0].toFixed(2)} (${(d.price - d.swingLows[0]).toFixed(2)} pts away)` : "N/A";
  const nearRes = d.swingHighs[0] ? `$${d.swingHighs[0].toFixed(2)} (${(d.swingHighs[0] - d.price).toFixed(2)} pts away)` : "N/A";
  const slDist  = +(d.atr * 3.0).toFixed(2);
  const tpDist  = +(slDist * 2.5).toFixed(2);

  return `You are an expert XAUUSD gold scalping analyst. Analyze the following real-time market data and generate a trading signal decision.

CURRENT MARKET DATA (5-minute chart):
Price: $${d.price.toFixed(2)}
EMA9: $${d.ema9.toFixed(2)} | EMA21: $${d.ema21.toFixed(2)} → ${emaTrend}
RSI(14): ${d.rsi.toFixed(1)} → ${rsiState}
MACD histogram: ${d.macdHist.toFixed(3)} (line: ${d.macdLine.toFixed(3)}, signal: ${d.macdSig.toFixed(3)}) → ${macdState}
ATR(14): ${d.atr.toFixed(2)} pts
Nearest support: ${nearSup}
Nearest resistance: ${nearRes}

RISK PARAMETERS:
Stop Loss distance: ATR × 3.0 = ${slDist} pts
Take Profit distance: SL × 2.5 = ${tpDist} pts
R:R ratio: 1:2.5

FUNDAMENTAL ANALYSIS:
News directional bias: ${d.newsBias >= 0 ? "+" : ""}${d.newsBias} (${d.newsLabel}) → ${d.newsAction}
Factor breakdown: ${d.newsFactors}

SESSION & CONTEXT:
Current session: ${d.session}
Recent signals: ${d.recentSignals}

DECISION RULES:
- Only signal BUY or SHORT when confidence ≥ 60% AND multiple factors align
- Use WAIT when signals are mixed or insufficient confluence
- Use BLOCK when there are strong reasons NOT to trade (extreme overbought/oversold, major event risk, conflicting news/technicals)
- ATR currently ${d.atr < 2 ? "very low (avoid — low volatility)" : d.atr > 8 ? "very high (caution — spike risk)" : "normal"}

Respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "decision": "BUY" | "SHORT" | "WAIT" | "BLOCK",
  "confidence": number between 0-100,
  "entryPrice": ${d.price.toFixed(2)},
  "stopLoss": calculated stop loss price,
  "takeProfit": calculated take profit price,
  "riskRewardRatio": 2.5,
  "analysis": {
    "trend": "one sentence on trend direction and EMA alignment",
    "momentum": "one sentence on RSI/MACD momentum state",
    "supportResistance": "one sentence on key levels and price location",
    "patterns": "one sentence on order blocks, FVGs, or price patterns",
    "fundamentals": "one sentence on news bias and fundamental alignment",
    "volatility": "one sentence on ATR and risk management",
    "session": "one sentence on session liquidity and conditions"
  },
  "keyReasons": ["reason1", "reason2", "reason3"],
  "risks": ["risk1", "risk2"],
  "alternativeScenario": "one sentence on what would invalidate this signal",
  "nextTrigger": "one sentence on what to watch next"
}`;
}

// ── Mock signal generator ─────────────────────────────────────────────────────

function generateMockSignal(d: CollectedData): AISignalResult {
  const now       = Date.now();
  const signalId  = `AI-MOCK-${now}`;
  const timestamp = new Date(now).toISOString();
  const slDist    = +(d.atr * 3.0).toFixed(2);
  const tpDist    = +(slDist * 2.5).toFixed(2);

  const emaBull = d.ema9 > d.ema21;
  const emaBear = d.ema9 < d.ema21;
  const rsiLong  = d.rsi >= 38 && d.rsi <= 65;
  const rsiShort = d.rsi >= 42 && d.rsi <= 68;
  const macdBull = d.macdHist > 0;
  const macdBear = d.macdHist < 0;
  const newsBull = d.newsBias >= 20;
  const newsBear = d.newsBias <= -20;
  const priceMoving = d.atr >= 1.5;

  const longScore  = (emaBull ? 1 : 0) + (rsiLong  ? 1 : 0) + (macdBull ? 1 : 0) + (newsBull ? 1 : 0);
  const shortScore = (emaBear ? 1 : 0) + (rsiShort ? 1 : 0) + (macdBear ? 1 : 0) + (newsBear ? 1 : 0);

  if (!priceMoving) {
    return {
      decision: "WAIT", confidence: 0, entryPrice: d.price, stopLoss: 0, takeProfit: 0,
      riskRewardRatio: 0, signalId, timestamp,
      analysis: {
        trend: "Price is essentially flat with very low ATR, no clear directional bias.",
        momentum: `RSI at ${d.rsi.toFixed(0)} and MACD near zero — momentum absent.`,
        supportResistance: "No meaningful distance to key levels in low-volatility environment.",
        patterns: "No tradeable patterns visible when volatility is suppressed.",
        fundamentals: `Fundamental bias ${d.newsBias >= 0 ? "+" : ""}${d.newsBias} (${d.newsLabel}) provides directional context but technicals are not confirming.`,
        volatility: `ATR at ${d.atr.toFixed(2)} pts — below threshold for reliable SL/TP placement.`,
        session: `${d.session} — activity may pick up later in session.`,
      },
      keyReasons: ["Volatility too low for reliable entries", "No technical momentum to confirm direction", "Risk/reward unfavorable in current conditions"],
      risks: ["Low ATR means stops can get hit on minor noise", "No session catalyst identified"],
      alternativeScenario: "Wait for ATR to expand above 2 pts before looking for entries.",
      nextTrigger: "Watch for a candle body > ATR × 1.2 as a momentum signal to re-evaluate.",
      source: "mock", model: "mock-v1",
    };
  }

  if (longScore >= 3) {
    const conf = 60 + (longScore - 3) * 8 + Math.round(Math.random() * 6);
    return {
      decision: "BUY", confidence: Math.min(conf, 82), entryPrice: d.price,
      stopLoss:   +(d.price - slDist).toFixed(2),
      takeProfit: +(d.price + tpDist).toFixed(2),
      riskRewardRatio: 2.5, signalId, timestamp,
      analysis: {
        trend: `EMA9 (${d.ema9.toFixed(2)}) above EMA21 (${d.ema21.toFixed(2)}) confirming bullish structure on 5-minute chart.`,
        momentum: `RSI ${d.rsi.toFixed(0)} in optimal long zone (38-65) with MACD histogram ${d.macdHist > 0 ? "positive and building" : "recovering from negative"}.`,
        supportResistance: `Price at $${d.price.toFixed(2)}, nearest support $${d.swingLows[0]?.toFixed(2) ?? "N/A"} provides cushion for ${slDist} pt stop.`,
        patterns: "Bullish EMA structure with momentum alignment suggests continuation setup.",
        fundamentals: `Fundamental bias ${d.newsBias >= 0 ? "+" : ""}${d.newsBias} (${d.newsLabel}) aligns with LONG direction — tailwind active.`,
        volatility: `ATR ${d.atr.toFixed(2)} supports SL of ${slDist} pts (ATR×3) and TP of ${tpDist} pts (R:R 1:2.5).`,
        session: `${d.session} — sufficient liquidity for clean execution.`,
      },
      keyReasons: [
        `EMA9 above EMA21 — bullish trend structure confirmed on 5m`,
        `RSI ${d.rsi.toFixed(0)} in long-friendly zone with room to run`,
        `Fundamental bias ${d.newsLabel} (${d.newsBias >= 0 ? "+" : ""}${d.newsBias}) supports LONG direction`,
      ],
      risks: [
        `Stop at $${(d.price - slDist).toFixed(2)} must hold — breach invalidates setup`,
        d.newsBias < 30 ? "Moderate fundamental support only — monitor closely" : "News events could override technical setup",
      ],
      alternativeScenario: `If price closes below EMA21 ($${d.ema21.toFixed(2)}), bias flips bearish — exit immediately.`,
      nextTrigger: `Break and hold above $${(d.price + d.atr).toFixed(2)} confirms momentum — target $${(d.price + tpDist).toFixed(2)}.`,
      source: "mock", model: "mock-v1",
    };
  }

  if (shortScore >= 3) {
    const conf = 60 + (shortScore - 3) * 8 + Math.round(Math.random() * 6);
    return {
      decision: "SHORT", confidence: Math.min(conf, 82), entryPrice: d.price,
      stopLoss:   +(d.price + slDist).toFixed(2),
      takeProfit: +(d.price - tpDist).toFixed(2),
      riskRewardRatio: 2.5, signalId, timestamp,
      analysis: {
        trend: `EMA9 (${d.ema9.toFixed(2)}) below EMA21 (${d.ema21.toFixed(2)}) confirming bearish structure on 5-minute chart.`,
        momentum: `RSI ${d.rsi.toFixed(0)} in short-compatible range with MACD histogram ${d.macdHist < 0 ? "negative and accelerating" : "fading from positive"}.`,
        supportResistance: `Price at $${d.price.toFixed(2)}, nearest resistance $${d.swingHighs[0]?.toFixed(2) ?? "N/A"} acts as ceiling for ${slDist} pt stop.`,
        patterns: "Bearish EMA structure with downside momentum suggests continuation lower.",
        fundamentals: `Fundamental bias ${d.newsBias >= 0 ? "+" : ""}${d.newsBias} (${d.newsLabel}) ${d.newsAction === "SHORT BIAS" ? "aligns with SHORT — tailwind active" : "neutral to fundamentals"}.`,
        volatility: `ATR ${d.atr.toFixed(2)} supports SL of ${slDist} pts (ATR×3) and TP of ${tpDist} pts (R:R 1:2.5).`,
        session: `${d.session} — sufficient liquidity for clean execution.`,
      },
      keyReasons: [
        `EMA9 below EMA21 — bearish trend structure confirmed on 5m`,
        `RSI ${d.rsi.toFixed(0)} in short-compatible zone with downside room`,
        `MACD histogram negative — momentum confirms downside bias`,
      ],
      risks: [
        `Stop at $${(d.price + slDist).toFixed(2)} must hold — breach invalidates setup`,
        d.newsBias > -20 ? "Fundamental bias not strongly bearish — counter-fundamental risk" : "News events could reverse sentiment abruptly",
      ],
      alternativeScenario: `If price closes above EMA21 ($${d.ema21.toFixed(2)}), bias flips bullish — exit immediately.`,
      nextTrigger: `Break below $${(d.price - d.atr).toFixed(2)} confirms momentum — target $${(d.price - tpDist).toFixed(2)}.`,
      source: "mock", model: "mock-v1",
    };
  }

  // Mixed / conflicting
  return {
    decision: "WAIT", confidence: 0, entryPrice: d.price, stopLoss: 0, takeProfit: 0,
    riskRewardRatio: 0, signalId, timestamp,
    analysis: {
      trend: `EMAs mixed — EMA9 ${d.ema9 > d.ema21 ? "above" : "below"} EMA21 but no strong directional conviction.`,
      momentum: `RSI ${d.rsi.toFixed(0)} in neutral zone (${d.rsi >= 45 && d.rsi <= 55 ? "dead centre" : "near neutral"}). MACD histogram ${d.macdHist.toFixed(3)} — no clear edge.`,
      supportResistance: `Price between support $${d.swingLows[0]?.toFixed(2) ?? "N/A"} and resistance $${d.swingHighs[0]?.toFixed(2) ?? "N/A"} — mid-range, no confluence zone.`,
      patterns: "No high-probability pattern visible. Waiting for price to reach a key level.",
      fundamentals: `Fundamental bias ${d.newsBias >= 0 ? "+" : ""}${d.newsBias} (${d.newsLabel}) provides directional lean but technicals not confirming.`,
      volatility: `ATR ${d.atr.toFixed(2)} — volatility present but signal quality insufficient.`,
      session: `${d.session} — conditions could improve as session progresses.`,
    },
    keyReasons: [
      "Technical indicators are not in alignment (only 2/4 factors confirm)",
      "No strong directional confluence at current price level",
      "Risk/reward not favourable without a key zone confluence",
    ],
    risks: ["Forcing a trade without confluence leads to low win-rate", "Current setup does not meet minimum threshold criteria"],
    alternativeScenario: "Wait for price to reach a swing high/low or key S/R zone before re-evaluating.",
    nextTrigger: `Watch EMA crossover or RSI move below 38 / above 62 for next directional signal.`,
    source: "mock", model: "mock-v1",
  };
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<AISignalResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.info("[AISignal] No ANTHROPIC_API_KEY set — using mock signal");
    return null;
  }

  const client = new Anthropic({ apiKey });

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    logger.info("[AISignal] Calling Claude API...");

    const msg = await client.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     "You are an expert gold (XAUUSD) scalping analyst. Always respond with valid JSON only — no markdown, no code blocks, no explanation.",
      messages:   [{ role: "user", content: prompt }],
    });

    clearTimeout(timeout);

    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    logger.info({ usage: msg.usage }, "[AISignal] Claude response received");

    // Strip markdown code blocks if present
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const parsed  = JSON.parse(cleaned) as Partial<AISignalResult>;

    // Validate required fields
    if (!parsed.decision || !["BUY", "SHORT", "WAIT", "BLOCK"].includes(parsed.decision)) {
      throw new Error(`Invalid decision: ${parsed.decision}`);
    }
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 100) {
      throw new Error(`Invalid confidence: ${parsed.confidence}`);
    }

    return {
      decision:            parsed.decision,
      confidence:          Math.round(parsed.confidence),
      entryPrice:          parsed.entryPrice     ?? 0,
      stopLoss:            parsed.stopLoss       ?? 0,
      takeProfit:          parsed.takeProfit      ?? 0,
      riskRewardRatio:     parsed.riskRewardRatio ?? 2.5,
      signalId:            `AI-CLAUDE-${Date.now()}`,
      timestamp:           new Date().toISOString(),
      analysis:            parsed.analysis       ?? { trend: "", momentum: "", supportResistance: "", patterns: "", fundamentals: "", volatility: "", session: "" },
      keyReasons:          parsed.keyReasons      ?? [],
      risks:               parsed.risks           ?? [],
      alternativeScenario: parsed.alternativeScenario ?? "",
      nextTrigger:         parsed.nextTrigger     ?? "",
      source:              "claude",
      model:               MODEL,
    };
  } catch (err) {
    clearTimeout(timeout);
    logger.error({ err }, "[AISignal] Claude API call failed — falling back to mock");
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateAISignal(forceRefresh = false): Promise<AISignalResult> {
  const now = Date.now();

  if (!forceRefresh && _cached && (now - _cachedAt) < CACHE_TTL_MS) {
    logger.info("[AISignal] Returning cached signal");
    return _cached;
  }

  logger.info("[AI SIGNAL GENERATOR] Starting analysis...");

  let data: CollectedData;
  try {
    data = await collectMarketData();
    logger.info(
      { price: data.price, ema9: +data.ema9.toFixed(2), ema21: +data.ema21.toFixed(2), rsi: +data.rsi.toFixed(1), atr: +data.atr.toFixed(2), newsBias: data.newsBias },
      "[AI SIGNAL GENERATOR] Market data collected"
    );
  } catch (err) {
    logger.error({ err }, "[AISignal] Failed to collect market data");
    // Return a safe WAIT signal
    const fallback: AISignalResult = {
      decision: "WAIT", confidence: 0, entryPrice: 0, stopLoss: 0, takeProfit: 0,
      riskRewardRatio: 0, signalId: `AI-ERR-${now}`, timestamp: new Date(now).toISOString(),
      analysis: { trend: "Data unavailable", momentum: "Data unavailable", supportResistance: "Data unavailable", patterns: "Data unavailable", fundamentals: "Data unavailable", volatility: "Data unavailable", session: "Data unavailable" },
      keyReasons: ["Market data collection failed — no signal generated"],
      risks: ["Cannot assess risk without market data"],
      alternativeScenario: "Wait for data feed to stabilise before trading.",
      nextTrigger: "Retry when OHLC data is available.",
      source: "mock", model: "error-fallback",
    };
    return fallback;
  }

  const prompt = buildPrompt(data);

  // Try Claude first, fall back to mock
  let result = await callClaude(prompt);
  if (!result) {
    result = generateMockSignal(data);
  }

  _cached   = result;
  _cachedAt = now;

  logger.info(
    { decision: result.decision, confidence: result.confidence, source: result.source, signalId: result.signalId },
    `[AI SIGNAL] ${result.decision} @ ${result.confidence}% [${result.source}]`
  );

  return result;
}

export function getCachedAISignal(): AISignalResult | null {
  return _cached;
}
