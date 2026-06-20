import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle,
  Landmark, BarChart3, Briefcase, DollarSign, Flame, Globe,
  Calendar, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FactorAnalysis {
  name:      string;
  key:       string;
  score:     number;
  weight:    number;
  label:     string;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  detail:    string;
}

interface UpcomingEvent {
  name:              string;
  scheduledTime:     string;
  impact:            "HIGH" | "EXTREME";
  expectedDirection: "BULLISH" | "BEARISH" | "BOTH";
  recommendation:    string;
}

interface ThresholdAdjustment {
  long:       number;
  short:      number;
  blockLong:  boolean;
  blockShort: boolean;
}

interface NewsAnalysis {
  bias:                number;
  label:               string;
  recommendation:      string;
  action:              string;
  thresholdAdjustment: ThresholdAdjustment;
  factors:             FactorAnalysis[];
  upcomingEvents:      UpcomingEvent[];
  lastUpdated:         string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function biasColors(bias: number) {
  if (bias >= 50)  return { text: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", bar: "bg-emerald-500" };
  if (bias >= 20)  return { text: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20", bar: "bg-emerald-400" };
  if (bias > -20)  return { text: "text-amber-300",   bg: "bg-amber-500/10   border-amber-500/20",   bar: "bg-amber-400"  };
  if (bias > -50)  return { text: "text-orange-400",  bg: "bg-orange-500/10  border-orange-500/20",  bar: "bg-orange-500" };
  return                  { text: "text-red-400",     bg: "bg-red-500/10     border-red-500/20",     bar: "bg-red-500"    };
}

function directionColor(dir: "BULLISH" | "BEARISH" | "NEUTRAL") {
  if (dir === "BULLISH") return "text-emerald-400";
  if (dir === "BEARISH") return "text-red-400";
  return "text-slate-400";
}

function factorIcon(key: string) {
  switch (key) {
    case "fed":          return Landmark;
    case "realRates":    return BarChart3;
    case "employment":   return Briefcase;
    case "dollar":       return DollarSign;
    case "inflation":    return Flame;
    case "geopolitical": return Globe;
    default:             return BarChart3;
  }
}

function FactorBar({ score }: { score: number }) {
  const pct = Math.abs(score);
  const bullish = score >= 0;
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      {/* Left (bearish) half */}
      <div className="flex-1 flex justify-end">
        {!bullish && (
          <div
            className="h-1.5 rounded-full bg-red-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {/* Centre tick */}
      <div className="w-px h-3 bg-white/20 flex-shrink-0" />
      {/* Right (bullish) half */}
      <div className="flex-1">
        {bullish && (
          <div
            className="h-1.5 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function NewsPanel() {
  const queryClient = useQueryClient();

  const { data: news, isLoading, isError } = useQuery<NewsAnalysis>({
    queryKey:       ["news"],
    queryFn:        async () => {
      const res = await fetch("/api/news");
      if (!res.ok) throw new Error("Failed to fetch news analysis");
      return res.json() as Promise<NewsAnalysis>;
    },
    refetchInterval: 30 * 60 * 1000, // 30 min
    staleTime:       30 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/news/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      return res.json() as Promise<NewsAnalysis>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["news"], data);
    },
  });

  if (isLoading) {
    return (
      <Card className="border-white/10 bg-gradient-to-b from-card to-background">
        <CardContent className="p-6 flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !news) {
    return (
      <Card className="border-white/10 bg-gradient-to-b from-card to-background">
        <CardContent className="p-6 flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">Failed to load fundamental analysis</span>
        </CardContent>
      </Card>
    );
  }

  const colors = biasColors(news.bias);
  const biasBarPct = ((news.bias + 100) / 200) * 100;

  return (
    <Card className="relative overflow-hidden border-white/10 bg-gradient-to-b from-card to-background shadow-2xl">
      <CardContent className="p-6 lg:p-8 flex flex-col gap-5 relative z-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xs font-medium text-slate-300 uppercase tracking-widest mb-2">
              Fundamental Analysis · News Bias
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <motion.span
                key={news.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`text-2xl font-black tracking-tight ${colors.text}`}
              >
                {news.bias >= 0 ? "+" : ""}{news.bias}
              </motion.span>
              <Badge className={`text-xs font-bold px-3 py-1 border ${colors.bg} ${colors.text}`}>
                {news.label}
              </Badge>
              <Badge variant="outline" className="text-xs border-white/15 text-slate-300 px-3 py-1">
                {news.action}
              </Badge>
            </div>
          </div>
          <button
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Bias gauge ──────────────────────────────────────────────────── */}
        <div className="bg-black/25 rounded-2xl border border-white/8 p-4 flex flex-col gap-3">
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>STRONG BEARISH  −100</span>
            <span>NEUTRAL  0</span>
            <span>+100  STRONG BULLISH</span>
          </div>
          {/* Gradient track */}
          <div className="relative h-3 rounded-full overflow-hidden bg-gradient-to-r from-red-600 via-amber-400 to-emerald-500">
            {/* Marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-lg border-2 border-slate-900 transition-all duration-700"
              style={{ left: `${biasBarPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{news.recommendation}</p>
        </div>

        {/* ── Threshold impact ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: "LONG threshold",  value: `${news.thresholdAdjustment.long}%`,  blocked: news.thresholdAdjustment.blockLong,  dir: "LONG"  },
            { label: "SHORT threshold", value: `${news.thresholdAdjustment.short}%`, blocked: news.thresholdAdjustment.blockShort, dir: "SHORT" },
            { label: "LONG signals",    value: news.thresholdAdjustment.blockLong  ? "BLOCKED" : "ACTIVE",  blocked: news.thresholdAdjustment.blockLong,  dir: "LONG"  },
            { label: "SHORT signals",   value: news.thresholdAdjustment.blockShort ? "BLOCKED" : "ACTIVE",  blocked: news.thresholdAdjustment.blockShort, dir: "SHORT" },
          ].map(({ label, value, blocked }) => (
            <div key={label} className={`rounded-xl border p-3 ${blocked ? "border-red-500/30 bg-red-500/5" : "border-white/5 bg-black/30"}`}>
              <span className="text-[10px] text-slate-400 block mb-1">{label}</span>
              <span className={`text-sm font-bold font-mono ${blocked ? "text-red-400" : "text-white"}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Factor breakdown ─────────────────────────────────────────────── */}
        <div className="bg-black/25 rounded-2xl border border-white/8 p-4 flex flex-col gap-1">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Factor Breakdown</p>
          {news.factors.map((f) => {
            const Icon = factorIcon(f.key);
            const dc   = directionColor(f.direction);
            return (
              <div key={f.key} className="flex items-center gap-3 py-1.5 group" title={f.detail}>
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${dc}`} />
                <div className="w-32 flex-shrink-0">
                  <span className="text-[11px] text-slate-300 font-medium truncate block">{f.name}</span>
                  <span className="text-[10px] text-slate-500">{Math.round(f.weight * 100)}% weight</span>
                </div>
                <FactorBar score={f.score} />
                <div className="w-10 text-right flex-shrink-0">
                  <span className={`text-xs font-bold font-mono ${f.score > 0 ? "text-emerald-400" : f.score < 0 ? "text-red-400" : "text-slate-400"}`}>
                    {f.score > 0 ? "+" : ""}{f.score}
                  </span>
                </div>
                <div className="w-28 flex-shrink-0 hidden lg:block">
                  <span className="text-[10px] text-slate-400 truncate block">{f.label}</span>
                </div>
              </div>
            );
          })}

          {/* Factor legend */}
          <div className="flex gap-4 pt-2 mt-1 border-t border-white/5">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[10px] text-slate-400">Bearish for gold</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[10px] text-slate-400">Bullish for gold</span></div>
          </div>
        </div>

        {/* ── Upcoming events ───────────────────────────────────────────────── */}
        {news.upcomingEvents.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Upcoming High-Impact Events Today
            </p>
            {news.upcomingEvents.map((ev, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 flex gap-3 ${ev.impact === "EXTREME" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/25 bg-amber-500/5"}`}
              >
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${ev.impact === "EXTREME" ? "text-red-400" : "text-amber-400"}`} />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{ev.name}</span>
                    <Badge variant="outline" className={`text-[10px] px-2 py-0 border ${ev.impact === "EXTREME" ? "border-red-500/40 text-red-400" : "border-amber-500/40 text-amber-400"}`}>
                      {ev.impact}
                    </Badge>
                    <span className="text-[10px] text-slate-400 font-mono">{ev.scheduledTime}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{ev.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
          <span>Mock data · Production: FRED API + News APIs</span>
          <span className="font-mono">
            Updated {news.lastUpdated && !isNaN(new Date(news.lastUpdated).getTime())
              ? format(new Date(news.lastUpdated), "HH:mm:ss")
              : "--:--:--"
            }
          </span>
        </div>

      </CardContent>
    </Card>
  );
}
