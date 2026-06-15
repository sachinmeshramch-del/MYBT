import { useGetSignal } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function IndicatorsRow() {
  const { data: signalData, isLoading } = useGetSignal({
    query: { refetchInterval: 60000 }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full bg-white/5 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!signalData) return null;

  const { indicators, emaScore, rsiScore, macdScore, momentumScore } = signalData;

  if (!indicators) return null;

  const trendColor = (t: string) =>
    t === "BULLISH" ? "text-success" : t === "BEARISH" ? "text-destructive" : "text-muted-foreground";

  const emaCross = indicators.ema9 > indicators.ema21;

  const statCards = [
    {
      label: "EMA 9",
      sublabel: "5m fast",
      value: indicators.ema9.toFixed(1),
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "EMA 21",
      sublabel: "5m slow",
      value: indicators.ema21.toFixed(1),
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "EMA Cross",
      sublabel: "5m bias",
      value: emaCross ? "BULLISH" : "BEARISH",
      color: emaCross ? "text-success" : "text-destructive",
    },
    {
      label: "RSI (14)",
      sublabel: "5m",
      value: indicators.rsi.toFixed(1),
      color: indicators.rsi > 65
        ? "text-destructive"
        : indicators.rsi < 35
        ? "text-success"
        : "text-foreground",
    },
    {
      label: "MACD",
      sublabel: "5m histogram",
      value: indicators.macdHistogram > 0 ? "BULLISH" : "BEARISH",
      color: indicators.macdHistogram > 0 ? "text-success" : "text-destructive",
    },
    {
      label: "ATR",
      sublabel: "5m volatility",
      value: indicators.atr.toFixed(2),
      color: "text-foreground",
    },
    {
      label: "5m Trend",
      sublabel: "context",
      value: indicators.trend5m,
      color: trendColor(indicators.trend5m),
    },
    {
      label: "1m Trend",
      sublabel: "entry confirm",
      value: indicators.trend1m,
      color: trendColor(indicators.trend1m),
    },
  ];

  const scores = [
    { label: "EMA", score: emaScore ?? 0,      max: 35, color: "bg-amber-500"   },
    { label: "RSI", score: rsiScore ?? 0,      max: 25, color: "bg-blue-500"    },
    { label: "MACD", score: macdScore ?? 0,    max: 25, color: "bg-violet-500"  },
    { label: "1m",   score: momentumScore ?? 0, max: 15, color: "bg-emerald-500" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Score mini-bars */}
      <div className="flex items-center gap-4 px-1">
        {scores.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 flex-1">
            <span className="text-[9px] text-slate-400 font-mono w-8 flex-shrink-0">{s.label}</span>
            <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
              <div
                className={`h-1 rounded-full transition-all duration-700 ${s.color}`}
                style={{ width: `${Math.round((s.score / s.max) * 100)}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-400 font-mono w-8 text-right flex-shrink-0">
              {s.score}/{s.max}
            </span>
          </div>
        ))}
      </div>

      {/* Indicator cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className="bg-black/20 border-white/5 overflow-hidden hover:bg-white/5 transition-colors duration-300">
            <div className="p-4 flex flex-col items-center justify-center text-center h-full">
              <span className="text-xs text-slate-300 font-medium mb-0.5">{stat.label}</span>
              {stat.sublabel && (
                <span className="text-[10px] text-slate-400 mb-1 font-mono">{stat.sublabel}</span>
              )}
              <span className={`text-sm font-bold font-mono tracking-tight ${stat.color}`}>
                {stat.value}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
