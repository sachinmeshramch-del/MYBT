import { useGetSignal } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertCircle, Target, ShieldX, ArrowRightCircle,
  TrendingUp, TrendingDown, Minus, Zap,
  Globe, FlameKindling, Sparkles, Activity, Timer, MoonStar, Crosshair,
} from "lucide-react";
import { CooldownTimer } from "./cooldown-timer";
import { motion } from "framer-motion";

// ── Session badge ──────────────────────────────────────────────────────────────
function SessionBadge({ active, asian }: { active?: string; asian?: boolean }) {
  if (!active) return null;
  const closed = active === "Market Closed";
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold tracking-wide ${
      closed
        ? "bg-zinc-500/10 border-zinc-500/30 text-zinc-400"
        : asian
        ? "bg-orange-500/10 border-orange-500/25 text-orange-400"
        : "bg-sky-500/10 border-sky-500/25 text-sky-400"
    }`}>
      {closed ? <MoonStar className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
      {active}
      {!closed && asian && <span className="text-orange-400/60">· Low liq.</span>}
    </div>
  );
}

// ── Strength badge ─────────────────────────────────────────────────────────────
function StrengthBadge({ strength }: { strength: "STRONG" | "NORMAL" | null }) {
  if (strength === "STRONG") return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
      <FlameKindling className="w-3.5 h-3.5 text-amber-400" />
      <span className="text-xs font-bold text-amber-400 tracking-wide">STRONG SIGNAL</span>
    </div>
  );
  if (strength === "NORMAL") return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30">
      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
      <span className="text-xs font-bold text-blue-400 tracking-wide">NORMAL SIGNAL</span>
    </div>
  );
  return null;
}

// ── Score bar ──────────────────────────────────────────────────────────────────
function ScoreBar({
  label, value, max, color,
}: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 flex-shrink-0 font-medium">{label}</span>
      <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
        <motion.div
          className={`h-1.5 rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-[10px] font-mono w-10 text-right flex-shrink-0 text-muted-foreground">
        {value}/{max}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function SignalPanel() {
  const { data: signalData, isLoading, isError } = useGetSignal({
    query: {
      refetchInterval: 60000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
      staleTime: 55000,
    }
  });

  if (isLoading) {
    return (
      <Card className="h-full bg-card/50">
        <CardContent className="p-6 flex flex-col gap-6">
          <Skeleton className="h-24 w-full bg-white/5 rounded-2xl" />
          <Skeleton className="h-16 w-full bg-white/5 rounded-xl" />
          <Skeleton className="h-8 w-3/4 bg-white/5" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20 w-full bg-white/5" />
            <Skeleton className="h-20 w-full bg-white/5" />
            <Skeleton className="h-20 w-full bg-white/5" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !signalData) {
    return (
      <Card className="h-full flex items-center justify-center border-destructive/20 bg-destructive/5">
        <div className="text-center text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="w-8 h-8" />
          <p>Failed to load scalp signal</p>
        </div>
      </Card>
    );
  }

  const {
    signal, confidence, entryPrice, stopLoss, takeProfit,
    trend, reason, timestamp, tradeDuration, cooldownRemaining,
    signalStrength, spikeCooldownCandles,
    threshold, thresholdReason,
    emaScore, rsiScore, macdScore, momentumScore, fvgScore, sweepScore,
    indicators,
  } = signalData;

  const session = signalData.session;

  const signalColors = {
    LONG:  "bg-success text-success-foreground shadow-[0_0_40px_rgba(34,197,94,0.25)] border-success/50",
    SHORT: "bg-destructive text-destructive-foreground shadow-[0_0_40px_rgba(239,68,68,0.25)] border-destructive/50",
    HOLD:  "bg-warning text-warning-foreground shadow-[0_0_20px_rgba(234,179,8,0.15)] border-warning/50",
  };

  const TrendIcon = trend === "BULLISH" ? TrendingUp : trend === "BEARISH" ? TrendingDown : Minus;
  const trendColor = trend === "BULLISH" ? "text-success" : trend === "BEARISH" ? "text-destructive" : "text-muted-foreground";

  const confBarColor =
    confidence >= 80 ? "bg-amber-400" :
    confidence >= 65 ? "bg-emerald-500" :
    confidence >= 50 ? "bg-blue-500" :
    "bg-zinc-500";

  const slDist = signal === "LONG"
    ? entryPrice - stopLoss
    : signal === "SHORT"
    ? stopLoss - entryPrice
    : Math.abs(stopLoss - entryPrice);

  const rrRatio = slDist > 0 ? ((Math.abs(takeProfit - entryPrice)) / slDist).toFixed(2) : "2.50";

  return (
    <Card className="relative overflow-hidden border-white/10 bg-gradient-to-b from-card to-background shadow-2xl">
      <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-10 pointer-events-none
        ${signal === "LONG" ? "bg-success" : signal === "SHORT" ? "bg-destructive" : "bg-warning"}`} />

      <CardContent className="p-6 lg:p-8 flex flex-col gap-5 relative z-10">

        {/* ── Header: Session + Signal + Confidence ────────────────────────── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-xs font-medium text-slate-300 uppercase tracking-widest">
                Scalp Signal · 5m/1m
              </h2>
              <SessionBadge active={session?.active} asian={session?.asian} />
            </div>
            <div className="flex items-center gap-3">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                key={signal}
                className={`px-8 py-3 rounded-xl font-black text-3xl tracking-tight border ${signalColors[signal]}`}
              >
                {signal}
              </motion.div>
              <div className="flex flex-col gap-1.5">
                {signalStrength && <StrengthBadge strength={signalStrength} />}
                {cooldownRemaining > 0 && <CooldownTimer initialSeconds={cooldownRemaining} />}
                {(spikeCooldownCandles ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30">
                    <Timer className="w-3.5 h-3.5 text-orange-400" />
                    <span className="text-xs font-bold text-orange-400 tracking-wide">
                      SPIKE COOLDOWN · {spikeCooldownCandles} {spikeCooldownCandles === 1 ? "candle" : "candles"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Confidence bar */}
          <div className="flex flex-col items-end w-full md:w-auto gap-1.5">
            <div className="flex justify-between w-full md:w-52 gap-2">
              <span className="text-xs text-slate-300">Confidence</span>
              <span className={`text-xs font-bold font-mono ${
                confidence >= 80 ? "text-amber-400" :
                confidence >= 65 ? "text-emerald-400" :
                confidence >= 50 ? "text-blue-400" :
                "text-slate-300"
              }`}>
                {confidence}%
              </span>
            </div>
            <div className="w-full md:w-52 h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
              <motion.div
                className={`h-full rounded-full ${confBarColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${confidence}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <p className="text-[10px] text-slate-400 text-right">EMA9/21 · RSI · MACD · 1m confirm</p>
          </div>
        </div>

        {/* ── Zone / Threshold Status ───────────────────────────────────────── */}
        {threshold !== undefined && (
          <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium ${
            threshold <= 40
              ? "bg-violet-500/10 border-violet-500/25 text-violet-300"
              : threshold <= 45
              ? "bg-amber-500/10 border-amber-500/25 text-amber-300"
              : "bg-zinc-500/10 border-zinc-500/25 text-zinc-400"
          }`}>
            <Crosshair className={`w-3.5 h-3.5 flex-shrink-0 ${
              threshold <= 40 ? "text-violet-400" : threshold <= 45 ? "text-amber-400" : "text-zinc-500"
            }`} />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">
                {threshold <= 40 ? "Order Block Zone" : threshold <= 45 ? "S/R Zone" : "No Key Zone"}&nbsp;·&nbsp;
              </span>
              <span className="opacity-80">Threshold: {threshold}% &nbsp;({thresholdReason})</span>
            </div>
          </div>
        )}

        {/* ── Score Breakdown ───────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/8 bg-black/25 p-4 flex flex-col gap-2.5">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Signal Score Breakdown</p>
          <ScoreBar label="EMA 9/21"        value={emaScore ?? 0}      max={35} color="bg-amber-500"   />
          <ScoreBar label="RSI (14)"        value={rsiScore ?? 0}      max={25} color="bg-blue-500"    />
          <ScoreBar label="MACD"            value={macdScore ?? 0}     max={25} color="bg-violet-500"  />
          <ScoreBar label="1m Confirm"      value={momentumScore ?? 0} max={15} color="bg-emerald-500" />
          <ScoreBar label="FVG Zone"        value={fvgScore ?? 0}      max={25} color="bg-cyan-500"    />
          <ScoreBar label="Liq. Sweep"      value={sweepScore ?? 0}    max={30} color="bg-orange-500"  />
          <div className="flex justify-between items-center pt-1 border-t border-white/5 mt-0.5">
            <span className="text-[10px] text-slate-300">Raw score</span>
            <span className="text-sm font-bold font-mono text-white">
              {(emaScore ?? 0) + (rsiScore ?? 0) + (macdScore ?? 0) + (momentumScore ?? 0) + (fvgScore ?? 0) + (sweepScore ?? 0)}
              <span className="text-slate-400 font-normal">/155</span>
              <span className="text-slate-400 font-normal text-[11px] ml-2">
                = {confidence}%
              </span>
            </span>
          </div>
        </div>

        {/* ── Entry / SL / TP ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-1">
              <ArrowRightCircle className="w-3.5 h-3.5" /> Entry
            </div>
            <span className="text-sm font-bold font-mono tabular-nums">{formatPrice(entryPrice)}</span>
          </div>

          <div className={`border rounded-xl p-3 flex flex-col items-center gap-1 transition-all ${
            signal === "LONG"  ? "border-red-500/30 bg-red-500/5" :
            signal === "SHORT" ? "border-red-500/30 bg-red-500/5" :
            "border-white/5 bg-black/30"
          }`}>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-1">
              <ShieldX className="w-3.5 h-3.5 text-red-400" /> Stop Loss
            </div>
            <span className="text-sm font-bold font-mono tabular-nums text-red-400">{formatPrice(stopLoss)}</span>
            <span className="text-[10px] text-slate-400 font-mono">ATR×3.0 · {slDist.toFixed(2)} pts</span>
          </div>

          <div className={`border rounded-xl p-3 flex flex-col items-center gap-1 transition-all ${
            signal === "LONG"  ? "border-emerald-500/30 bg-emerald-500/5" :
            signal === "SHORT" ? "border-emerald-500/30 bg-emerald-500/5" :
            "border-white/5 bg-black/30"
          }`}>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-1">
              <Target className="w-3.5 h-3.5 text-emerald-400" /> Take Profit
            </div>
            <span className="text-sm font-bold font-mono tabular-nums text-emerald-400">{formatPrice(takeProfit)}</span>
            <span className="text-[10px] text-slate-400 font-mono">R:R 1:{rrRatio}</span>
          </div>
        </div>

        {/* ── Current Indicators Quick-View ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            {
              label: "EMA 9",
              value: indicators?.ema9?.toFixed(1) ?? "—",
              sub: "5m",
              color: (indicators?.ema9 ?? 0) > (indicators?.ema21 ?? 0) ? "text-success" : "text-destructive",
            },
            {
              label: "RSI (14)",
              value: indicators?.rsi?.toFixed(1) ?? "—",
              sub: "5m",
              color: (indicators?.rsi ?? 50) > 65 ? "text-destructive" :
                     (indicators?.rsi ?? 50) < 35 ? "text-success" : "text-foreground",
            },
            {
              label: "ATR",
              value: indicators?.atr?.toFixed(2) ?? "—",
              sub: "5m volatility",
              color: "text-foreground",
            },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-black/30 border border-white/5 rounded-xl p-3 flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-300">{label}</span>
              <span className={`text-sm font-bold font-mono ${color}`}>{value}</span>
              <span className="text-[9px] text-slate-400 font-mono">{sub}</span>
            </div>
          ))}
        </div>

        {/* ── Reason / Signal Reasoning ──────────────────────────────────────── */}
        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-1">Signal Reasoning</h4>
              <p className="text-sm text-slate-100 leading-relaxed">{reason}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
            <div>
              <span className="text-xs text-slate-300 block mb-1">Market Trend</span>
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${trendColor}`}>
                <TrendIcon className="w-4 h-4" />
                {trend}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-300 block mb-1">Trade Duration</span>
              <span className="text-sm font-semibold text-white">{tradeDuration}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-white/5">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Updated {timestamp && !isNaN(new Date(timestamp).getTime()) ? format(new Date(timestamp), "HH:mm:ss") : "--:--:--"}</span>
            </div>
            <Badge variant="outline" className="text-[10px] border-white/20 text-slate-300 py-0 px-1.5">
              EMA · RSI · MACD
            </Badge>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
