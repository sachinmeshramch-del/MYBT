import { logger } from "./logger.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FactorAnalysis {
  name:      string;
  key:       string;
  score:     number;    // -100 to +100 (positive = bullish for gold)
  weight:    number;    // 0.0 to 1.0
  label:     string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  detail:    string;
}

export interface UpcomingEvent {
  name:              string;
  scheduledTime:     string;
  impact:            "HIGH" | "EXTREME";
  expectedDirection: "BULLISH" | "BEARISH" | "BOTH";
  recommendation:    string;
}

export interface ThresholdAdjustment {
  long:        number;
  short:       number;
  blockLong:   boolean;
  blockShort:  boolean;
}

export interface NewsAnalysis {
  bias:                number;   // -100 to +100
  label:               string;   // STRONG BULLISH / BULLISH / MILDLY BULLISH / NEUTRAL / MILDLY BEARISH / BEARISH / STRONG BEARISH
  recommendation:      string;
  action:              string;   // LONG BIAS / NEUTRAL / SHORT BIAS
  thresholdAdjustment: ThresholdAdjustment;
  factors:             FactorAnalysis[];
  upcomingEvents:      UpcomingEvent[];
  lastUpdated:         string;
}

// ── Factor weights (must sum to 1.0) ─────────────────────────────────────────
const WEIGHTS = {
  fed:          0.30,   // Fed interest rate decisions & forward guidance
  realRates:    0.30,   // Real interest rates (nominal - inflation)
  employment:   0.15,   // NFP & employment data
  dollar:       0.15,   // US Dollar strength (DXY)
  inflation:    0.05,   // CPI/PPI surprises
  geopolitical: 0.05,   // Geopolitical events & risk sentiment
};

// ── Threshold adjustment from bias score ──────────────────────────────────────
function computeThresholdAdjustment(bias: number): ThresholdAdjustment {
  const blockLong  = bias <= -70;
  const blockShort = bias >=  70;

  let longThr  = 55;
  let shortThr = 55;

  if      (bias >= 80) longThr = 40;
  else if (bias >= 50) longThr = 45;
  else if (bias >= 20) longThr = 50;

  if      (bias <= -80) shortThr = 40;
  else if (bias <= -50) shortThr = 45;
  else if (bias <= -20) shortThr = 50;

  return { long: longThr, short: shortThr, blockLong, blockShort };
}

function getBiasLabel(bias: number): { label: string; recommendation: string; action: string } {
  if (bias >= 80)  return { label: "STRONG BULLISH", recommendation: "Strong fundamental tailwind — prioritise LONG setups, SHORT signals blocked",   action: "LONG BIAS"  };
  if (bias >= 50)  return { label: "BULLISH",        recommendation: "Fundamentals favour gold bulls — LONG threshold reduced to 45%",                 action: "LONG BIAS"  };
  if (bias >= 20)  return { label: "MILDLY BULLISH", recommendation: "Slight fundamental support — LONG threshold reduced to 50%",                     action: "LONG BIAS"  };
  if (bias > -20)  return { label: "NEUTRAL",        recommendation: "Mixed fundamental signals — default 55% threshold applies to both directions",   action: "NEUTRAL"    };
  if (bias > -50)  return { label: "MILDLY BEARISH", recommendation: "Slight fundamental headwind — SHORT threshold reduced to 50%",                   action: "SHORT BIAS" };
  if (bias > -80)  return { label: "BEARISH",        recommendation: "Fundamentals favour gold bears — SHORT threshold reduced to 45%",                action: "SHORT BIAS" };
  return                  { label: "STRONG BEARISH", recommendation: "Strong fundamental headwind — prioritise SHORT setups, LONG signals blocked",    action: "SHORT BIAS" };
}

function scoreToDirection(score: number): "BULLISH" | "BEARISH" | "NEUTRAL" {
  if (score >  10) return "BULLISH";
  if (score < -10) return "BEARISH";
  return "NEUTRAL";
}

// ── Scenario data (4 rotating 4-hour blocks) ─────────────────────────────────
interface FactorState { score: number; label: string; detail: string; }
interface ScenarioData {
  fed: FactorState; realRates: FactorState; employment: FactorState;
  dollar: FactorState; inflation: FactorState; geopolitical: FactorState;
}

const SCENARIOS: ScenarioData[] = [
  // Scenario 0 — MILDLY BULLISH (~+28)
  // Fed pivot expected, inflation cooling, geopolitical tensions persist
  {
    fed:          { score:  60, label: "Dovish pivot expected",        detail: "Fed signals rate cuts likely in H2. Dot plot shifted lower. Gold-supportive." },
    realRates:    { score:  20, label: "Real rates declining",         detail: "Inflation falling faster than nominal yields → real rates easing. Bullish for gold." },
    employment:   { score: -15, label: "Labour market solid",          detail: "NFP +290k vs 250k expected. Strong jobs reduce Fed urgency. Mild headwind." },
    dollar:       { score:  10, label: "Dollar mildly weak",           detail: "DXY at 102.5, range-bound with slight downward bias. Mild tailwind." },
    inflation:    { score:  35, label: "CPI cooling toward target",    detail: "CPI 2.8% YoY, trending toward 2% target. Supports rate-cut narrative." },
    geopolitical: { score:  65, label: "Elevated geopolitical risk",   detail: "Middle East & Eastern Europe tensions elevated. Safe-haven flows supporting gold." },
  },
  // Scenario 1 — BULLISH (~+56)
  // Fed confirmed cuts, weak jobs, geopolitical escalation, weak dollar
  {
    fed:          { score:  80, label: "Fed confirmed dovish pivot",   detail: "FOMC confirmed 3 cuts this year. Policy pivot fully priced in. Very bullish." },
    realRates:    { score:  60, label: "Real rates turned negative",   detail: "Real rates at -0.5% (CPI 4.5%, Fed rate 4.0%). Classic gold bull environment." },
    employment:   { score:  30, label: "NFP miss — weak jobs",         detail: "NFP +180k vs 220k expected. Soft labour market accelerates Fed pivot." },
    dollar:       { score:  40, label: "Dollar weakening",             detail: "DXY broke below 100 — multi-month low. Significant tailwind for gold." },
    inflation:    { score: -10, label: "PCE slightly elevated",        detail: "PCE 3.1%, above 2% target. Creates some uncertainty but mostly priced in." },
    geopolitical: { score:  80, label: "Crisis escalation",            detail: "Major geopolitical escalation driving safe-haven demand. Very bullish for gold." },
  },
  // Scenario 2 — NEUTRAL (~-8)
  // Mixed signals, markets range-bound, Fed on hold
  {
    fed:          { score: -20, label: "Fed hold — hawkish tilt",      detail: "Fed held rates, signalled higher-for-longer. Modest headwind for gold." },
    realRates:    { score: -10, label: "Real rates slightly positive",  detail: "Real rates ~+0.5%. Mild opportunity cost vs gold. Slight headwind." },
    employment:   { score:   0, label: "Jobs in-line with forecast",   detail: "NFP +225k vs 220k expected. No surprise, no policy impact." },
    dollar:       { score:   0, label: "Dollar range-bound",           detail: "DXY at 104, consolidating. No directional bias for gold from FX." },
    inflation:    { score:  10, label: "Inflation on target",          detail: "CPI 2.2%, close to 2% target. Slight positive — supports eventual cuts." },
    geopolitical: { score:  20, label: "Moderate background risk",     detail: "Limited major events. Some safe-haven demand from background tensions." },
  },
  // Scenario 3 — BEARISH (~-65)
  // Hawkish Fed, very strong jobs, surging dollar, high real rates
  {
    fed:          { score: -70, label: "Fed hawkish — no cuts planned", detail: "FOMC minutes confirm no 2025 cuts. Higher-for-longer. Very bearish for gold." },
    realRates:    { score: -80, label: "Real rates at +2.5%",           detail: "High positive real rates (5.25% Fed, 2.8% CPI). Strong headwind for gold." },
    employment:   { score: -60, label: "Blowout NFP +380k",             detail: "NFP far exceeded 240k forecast. Fed has no reason to cut rates." },
    dollar:       { score: -55, label: "Dollar surging — DXY 107",      detail: "Dollar at 6-month high. Major headwind for gold pricing in USD." },
    inflation:    { score: -30, label: "Inflation re-accelerating",     detail: "CPI ticked up to 3.5% — keeps Fed hawkish, gold under sustained pressure." },
    geopolitical: { score: -20, label: "Risk-on — equities at ATH",     detail: "S&P 500 at all-time high, VIX at 12. Low safe-haven demand for gold." },
  },
];

// ── Upcoming events by day of week ───────────────────────────────────────────
function getUpcomingEvents(): UpcomingEvent[] {
  const now  = new Date();
  const day  = now.getUTCDay();   // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  const hour = now.getUTCHours();
  const events: UpcomingEvent[] = [];

  if (day === 2 && hour < 13) {
    events.push({
      name: "US CPI Inflation Data", scheduledTime: "12:30 UTC", impact: "EXTREME",
      expectedDirection: "BOTH",
      recommendation: "Hotter CPI = bearish gold (delays cuts). Cooler = bullish. Expect 30+ pt move. Avoid 15 min pre/post release.",
    });
  }
  if (day === 3) {
    if (hour < 13) {
      events.push({
        name: "ADP Non-Farm Employment", scheduledTime: "12:15 UTC", impact: "HIGH",
        expectedDirection: "BOTH",
        recommendation: "Beat = bearish (less urgency for cuts), Miss = bullish. Widen stops 20% before release.",
      });
    }
    if (hour < 19) {
      events.push({
        name: "FOMC Meeting Minutes", scheduledTime: "18:00 UTC", impact: "EXTREME",
        expectedDirection: "BOTH",
        recommendation: "High volatility. Wait 15 min post-release. Hawkish tone → SHORT bias. Dovish language → LONG bias.",
      });
    }
  }
  if (day === 4 && hour < 13) {
    events.push({
      name: "US Initial Jobless Claims", scheduledTime: "12:30 UTC", impact: "HIGH",
      expectedDirection: "BOTH",
      recommendation: "Higher claims = bullish gold (softer labour). Lower = bearish. Short-term spike likely at release.",
    });
  }
  if (day === 5 && hour < 14) {
    events.push({
      name: "Non-Farm Payrolls (NFP)", scheduledTime: "12:30 UTC", impact: "EXTREME",
      expectedDirection: "BOTH",
      recommendation: "Biggest gold mover. Avoid trading 30 min before/after. Beat = bearish, Miss = bullish for gold.",
    });
    events.push({
      name: "US Unemployment Rate", scheduledTime: "12:30 UTC", impact: "HIGH",
      expectedDirection: "BOTH",
      recommendation: "Released with NFP. Rising unemployment = gold-positive (forces Fed to cut rates).",
    });
  }
  if (day === 1 && hour < 9) {
    events.push({
      name: "London Session Open", scheduledTime: "08:00 UTC", impact: "HIGH",
      expectedDirection: "BOTH",
      recommendation: "Increased volatility at open. Allow 15 min for initial moves to settle before taking signals.",
    });
  }

  return events;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cached:   NewsAnalysis | null = null;
let _cachedAt  = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Public API ────────────────────────────────────────────────────────────────
export function getNewsAnalysis(forceRefresh = false): NewsAnalysis {
  const now = Date.now();
  if (!forceRefresh && _cached && (now - _cachedAt) < CACHE_TTL_MS) {
    return _cached;
  }

  const scenarioIdx = Math.floor(now / (4 * 3600 * 1000)) % SCENARIOS.length;
  const s = SCENARIOS[scenarioIdx]!;

  const rawBias =
    s.fed.score          * WEIGHTS.fed          +
    s.realRates.score    * WEIGHTS.realRates     +
    s.employment.score   * WEIGHTS.employment    +
    s.dollar.score       * WEIGHTS.dollar        +
    s.inflation.score    * WEIGHTS.inflation     +
    s.geopolitical.score * WEIGHTS.geopolitical;

  const bias = Math.round(Math.max(-100, Math.min(100, rawBias)));
  const { label, recommendation, action } = getBiasLabel(bias);
  const thresholdAdjustment = computeThresholdAdjustment(bias);

  const factors: FactorAnalysis[] = [
    { name: "Fed Policy",          key: "fed",          score: s.fed.score,          weight: WEIGHTS.fed,          label: s.fed.label,          direction: scoreToDirection(s.fed.score),          detail: s.fed.detail          },
    { name: "Real Interest Rates", key: "realRates",    score: s.realRates.score,    weight: WEIGHTS.realRates,    label: s.realRates.label,    direction: scoreToDirection(s.realRates.score),    detail: s.realRates.detail    },
    { name: "Employment (NFP)",    key: "employment",   score: s.employment.score,   weight: WEIGHTS.employment,   label: s.employment.label,   direction: scoreToDirection(s.employment.score),   detail: s.employment.detail   },
    { name: "US Dollar (DXY)",     key: "dollar",       score: s.dollar.score,       weight: WEIGHTS.dollar,       label: s.dollar.label,       direction: scoreToDirection(s.dollar.score),       detail: s.dollar.detail       },
    { name: "Inflation (CPI)",     key: "inflation",    score: s.inflation.score,    weight: WEIGHTS.inflation,    label: s.inflation.label,    direction: scoreToDirection(s.inflation.score),    detail: s.inflation.detail    },
    { name: "Geopolitical Risk",   key: "geopolitical", score: s.geopolitical.score, weight: WEIGHTS.geopolitical, label: s.geopolitical.label, direction: scoreToDirection(s.geopolitical.score), detail: s.geopolitical.detail },
  ];

  const analysis: NewsAnalysis = {
    bias, label, recommendation, action,
    thresholdAdjustment,
    factors,
    upcomingEvents: getUpcomingEvents(),
    lastUpdated:    new Date().toISOString(),
  };

  _cached   = analysis;
  _cachedAt = now;

  logger.info(
    { bias, label, action, scenarioIdx, longThr: thresholdAdjustment.long, shortThr: thresholdAdjustment.short, blockLong: thresholdAdjustment.blockLong, blockShort: thresholdAdjustment.blockShort },
    `[NewsAnalyzer] ${label} (${bias >= 0 ? "+" : ""}${bias}) — scenario ${scenarioIdx}`
  );

  return analysis;
}

export function refreshNewsAnalysis(): NewsAnalysis {
  return getNewsAnalysis(true);
}
