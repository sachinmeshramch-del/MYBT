import { db, signalsTable } from "@workspace/db";
import { eq, or, desc } from "drizzle-orm";
import { logger } from "./logger.js";

export interface TradeRecord {
  id:          number;
  signal:      "LONG" | "SHORT";
  result:      "WIN" | "LOSS";
  entryPrice:  number;
  closedPrice: number;
  pnlPoints:   number;
  timestamp:   string;
}

export interface AnalyticsSummary {
  totalCompleted: number;
  wins:           number;
  losses:         number;
  winRate:        number;
  lossRate:       number;
  avgProfit:      number;
  avgLoss:        number;
  expectancy:     number;
  last10:         TradeRecord[];
  smartMode:      boolean;
  smartModeStatus: string;
  learningStatus:  string;
  sufficientData:  boolean;
  streak:          number;
  recentTrend:     "HOT" | "COLD" | "STABLE" | "LEARNING";
}

const CACHE_TTL = 30_000;
let cachedAnalytics:  AnalyticsSummary | null = null;
let lastAnalyticsTime = 0;
let smartModeEnabled  = false;

export function isSmartMode(): boolean { return smartModeEnabled; }

export function setSmartMode(enabled: boolean) {
  smartModeEnabled = enabled;
  cachedAnalytics  = null;
  logger.info({ smartMode: enabled }, "Smart Mode toggled");
}

function calcStreak(last10: TradeRecord[]): number {
  if (last10.length === 0) return 0;
  const first = last10[0].result;
  let streak = 0;
  for (const t of last10) {
    if (t.result === first) streak++;
    else break;
  }
  return first === "WIN" ? streak : -streak;
}

export async function getAnalyticsSummary(forceRefresh = false): Promise<AnalyticsSummary> {
  const now = Date.now();
  if (!forceRefresh && cachedAnalytics && (now - lastAnalyticsTime) < CACHE_TTL) {
    return cachedAnalytics;
  }

  try {
    const closedRows = await db
      .select()
      .from(signalsTable)
      .where(or(
        eq(signalsTable.tradeStatus, "TARGET_HIT"),
        eq(signalsTable.tradeStatus, "STOP_HIT"),
      ))
      .orderBy(desc(signalsTable.createdAt))
      .limit(200);

    const completed = closedRows.filter(r =>
      (r.signal === "LONG" || r.signal === "SHORT") &&
      r.pnlPoints !== null && r.closedPrice !== null
    );

    const totalCompleted = completed.length;
    const wins   = completed.filter(r => r.tradeStatus === "TARGET_HIT").length;
    const losses = completed.filter(r => r.tradeStatus === "STOP_HIT").length;
    const winRate  = totalCompleted > 0 ? Math.round((wins   / totalCompleted) * 100) : 0;
    const lossRate = totalCompleted > 0 ? Math.round((losses / totalCompleted) * 100) : 0;

    const winPnls  = completed.filter(r => r.tradeStatus === "TARGET_HIT").map(r => r.pnlPoints ?? 0);
    const lossPnls = completed.filter(r => r.tradeStatus === "STOP_HIT").map(r => r.pnlPoints ?? 0);

    const avgProfit = winPnls.length  > 0
      ? winPnls.reduce((s, v)  => s + v, 0) / winPnls.length  : 0;
    const avgLoss = lossPnls.length > 0
      ? Math.abs(lossPnls.reduce((s, v) => s + v, 0) / lossPnls.length) : 0;
    const expectancy = totalCompleted > 0
      ? (winRate / 100) * avgProfit - (lossRate / 100) * avgLoss : 0;

    const last10: TradeRecord[] = completed.slice(0, 10).map(r => ({
      id:          r.id,
      signal:      r.signal as "LONG" | "SHORT",
      result:      r.tradeStatus === "TARGET_HIT" ? "WIN" : "LOSS",
      entryPrice:  r.entryPrice,
      closedPrice: r.closedPrice ?? r.entryPrice,
      pnlPoints:   r.pnlPoints ?? 0,
      timestamp:   r.createdAt.toISOString(),
    }));

    const sufficientData = totalCompleted >= 10;
    const streak = calcStreak(last10);

    const recentWins  = last10.slice(0, Math.min(5, last10.length)).filter(t => t.result === "WIN").length;
    const recentTotal = Math.min(5, last10.length);
    let recentTrend: AnalyticsSummary["recentTrend"] = "LEARNING";
    if (recentTotal >= 3) {
      const recentWR = recentWins / recentTotal;
      recentTrend = recentWR >= 0.67 ? "HOT" : recentWR <= 0.33 ? "COLD" : "STABLE";
    }

    let smartModeStatus = "OFF – all signals shown";
    if (smartModeEnabled && !sufficientData) {
      smartModeStatus = `ON – building history (${totalCompleted}/10 scalp trades needed)`;
    } else if (smartModeEnabled && winRate >= 60) {
      smartModeStatus = `ON – win rate ${winRate}% ✓ (above 60% threshold)`;
    } else if (smartModeEnabled && winRate < 60) {
      smartModeStatus = `ON – STRICT (win rate ${winRate}% < 60%, raising confidence minimum)`;
    }

    let learningStatus: string;
    if (totalCompleted === 0) {
      learningStatus = "Collecting first scalp trades…";
    } else if (totalCompleted < 5) {
      learningStatus = `Early phase (${totalCompleted} trades) — observing EMA/RSI/MACD patterns`;
    } else if (totalCompleted < 10) {
      learningStatus = `Learning (${totalCompleted}/10 trades) — building performance baseline`;
    } else if (winRate >= 60) {
      learningStatus = `Active (${totalCompleted} trades) — ${winRate}% win rate · scalp system performing well`;
    } else {
      learningStatus = `Active (${totalCompleted} trades) — ${winRate}% win rate · monitoring signal quality`;
    }

    const result: AnalyticsSummary = {
      totalCompleted,
      wins,
      losses,
      winRate,
      lossRate,
      avgProfit:  +avgProfit.toFixed(2),
      avgLoss:    +avgLoss.toFixed(2),
      expectancy: +expectancy.toFixed(2),
      last10,
      smartMode:       smartModeEnabled,
      smartModeStatus,
      learningStatus,
      sufficientData,
      streak,
      recentTrend,
    };

    cachedAnalytics   = result;
    lastAnalyticsTime = now;
    return result;

  } catch (err) {
    logger.warn({ err }, "Analytics query failed");
    return {
      totalCompleted: 0, wins: 0, losses: 0,
      winRate: 0, lossRate: 0, avgProfit: 0, avgLoss: 0, expectancy: 0,
      last10: [], smartMode: smartModeEnabled,
      smartModeStatus: "unavailable", learningStatus: "Unavailable",
      sufficientData: false, streak: 0, recentTrend: "LEARNING",
    };
  }
}
