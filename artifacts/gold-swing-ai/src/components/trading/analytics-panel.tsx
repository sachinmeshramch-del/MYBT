import { useState } from "react";
import { useGetAnalytics, useSetSmartMode } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  TrendingUp, Flame, Snowflake, Activity, Zap, BarChart2,
} from "lucide-react";

function WinDot({ result, pnl }: { result: "WIN" | "LOSS"; pnl: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div title={result} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
        result === "WIN"
          ? "bg-success/20 border-success text-success"
          : "bg-destructive/20 border-destructive text-destructive"
      }`}>
        {result === "WIN" ? "W" : "L"}
      </div>
      <span className={`text-[9px] font-mono leading-none ${result === "WIN" ? "text-success/70" : "text-destructive/70"}`}>
        {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}
      </span>
    </div>
  );
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-black/30 rounded-xl p-3 gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-lg font-bold font-mono leading-tight ${color ?? "text-foreground"}`}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground font-mono">{sub}</span>}
    </div>
  );
}

export function AnalyticsPanel() {
  const { data, isLoading, refetch } = useGetAnalytics({
    query: { refetchInterval: 30000 },
  });
  const { mutate: toggleSmartMode, isPending } = useSetSmartMode();
  const [optimisticSmart, setOptimisticSmart] = useState<boolean | null>(null);

  const smartMode = optimisticSmart ?? data?.smartMode ?? false;

  function handleSmartToggle(checked: boolean) {
    setOptimisticSmart(checked);
    toggleSmartMode(
      { data: { enabled: checked } },
      {
        onSuccess: () => { refetch(); setOptimisticSmart(null); },
        onError:   () => setOptimisticSmart(null),
      }
    );
  }

  const winRate = data?.winRate ?? 0;
  const winRateColor =
    winRate >= 65 ? "text-success" :
    winRate >= 50 ? "text-yellow-400" :
    winRate > 0   ? "text-destructive" :
    "text-muted-foreground";

  const winRateBarColor =
    winRate >= 65 ? "bg-success" :
    winRate >= 50 ? "bg-yellow-400" :
    "bg-destructive";

  const streak     = data?.streak ?? 0;
  const streakAbs  = Math.abs(streak);
  const recentTrend = data?.recentTrend ?? "LEARNING";

  const TrendIcon =
    recentTrend === "HOT"    ? Flame     :
    recentTrend === "COLD"   ? Snowflake :
    recentTrend === "STABLE" ? TrendingUp:
    Activity;

  const trendColor =
    recentTrend === "HOT"    ? "text-orange-400" :
    recentTrend === "COLD"   ? "text-blue-400"   :
    recentTrend === "STABLE" ? "text-emerald-400":
    "text-zinc-500";

  return (
    <Card className="border-white/5 bg-card/50 overflow-hidden h-full">
      <CardHeader className="pb-3 border-b border-white/5 bg-black/20">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-amber-400" />
          Scalp Performance
          <span className="ml-auto flex items-center gap-2 text-sm font-normal">
            <span className={`text-xs ${smartMode ? "text-amber-400" : "text-muted-foreground"}`}>
              Smart Mode
            </span>
            <Switch
              checked={smartMode}
              onCheckedChange={handleSmartToggle}
              disabled={isPending || isLoading}
              className="data-[state=checked]:bg-amber-500"
            />
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 flex flex-col gap-4">

        {/* Learning Status */}
        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
          <Zap className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <span className="text-xs text-amber-200/80 leading-snug">
            {isLoading ? "Loading…" : (data?.learningStatus ?? "Collecting data…")}
          </span>
        </div>

        {/* Smart Mode Status */}
        {smartMode && (
          <div className={`text-[11px] rounded-lg px-3 py-1.5 border leading-snug ${
            data?.sufficientData && winRate < 60
              ? "bg-destructive/10 border-destructive/30 text-destructive/90"
              : "bg-success/10 border-success/30 text-success/90"
          }`}>
            {data?.smartModeStatus ?? "Smart Mode ON"}
          </div>
        )}

        {/* Win Rate + Streak */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Win Rate</span>
            <div className="flex items-center gap-2">
              {streakAbs >= 2 && (
                <span className={`text-xs font-mono font-bold ${streak > 0 ? "text-orange-400" : "text-blue-400"}`}>
                  {streak > 0 ? `🔥${streakAbs}W` : `❄️${streakAbs}L`}
                </span>
              )}
              <span className={`text-2xl font-bold font-mono leading-none ${winRateColor}`}>
                {data?.totalCompleted ? `${winRate}%` : "—"}
              </span>
            </div>
          </div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden relative">
            <div
              className={`h-2 rounded-full transition-all duration-700 ${winRateBarColor}`}
              style={{ width: `${Math.max(winRate, 2)}%` }}
            />
            <div className="absolute top-0 h-full w-px bg-white/40 opacity-60" style={{ left: "55%" }} />
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground/50">
            <span>0%</span>
            <span className="flex items-center gap-0.5">
              <span className="w-px h-2 bg-white/30 inline-block" />55% threshold
            </span>
            <span>100%</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Total Trades" value={String(data?.totalCompleted ?? 0)} />
          <StatBox
            label="W / L"
            value={`${data?.wins ?? 0} / ${data?.losses ?? 0}`}
            color={winRate >= 50 ? "text-success" : "text-destructive"}
          />
          <StatBox
            label="Avg Profit"
            value={data?.avgProfit ? `+${data.avgProfit.toFixed(2)}` : "—"}
            sub="USD pts"
            color="text-success"
          />
          <StatBox
            label="Expectancy"
            value={data?.totalCompleted
              ? (data.expectancy >= 0 ? `+${data.expectancy.toFixed(2)}` : `${data.expectancy.toFixed(2)}`)
              : "—"
            }
            sub="per trade"
            color={(data?.expectancy ?? 0) >= 0 ? "text-success" : "text-destructive"}
          />
        </div>

        {/* Recent trend badge */}
        {data?.totalCompleted && data.totalCompleted >= 3 ? (
          <div className="flex items-center gap-2">
            <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
            <span className={`text-xs font-semibold ${trendColor}`}>
              {recentTrend === "HOT"    ? "Hot streak — scalp system firing well"       :
               recentTrend === "COLD"   ? "Cold streak — consider reducing position size" :
               recentTrend === "STABLE" ? "Stable performance"                            :
               "Gathering scalp data…"}
            </span>
          </div>
        ) : null}

        {/* Last 10 trades */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            Last {data?.last10?.length ?? 0} Trades
          </span>
          {!data?.last10?.length ? (
            <p className="text-xs text-muted-foreground italic">No completed scalp trades yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.last10.map(t => (
                <WinDot key={t.id} result={t.result} pnl={t.pnlPoints} />
              ))}
              {Array.from({ length: Math.max(0, 10 - (data.last10?.length ?? 0)) }).map((_, i) => (
                <div key={`empty-${i}`} className="w-5 h-5 rounded-full border border-white/10 bg-white/3 flex-shrink-0" />
              ))}
            </div>
          )}
        </div>

        {/* Risk/Reward reminder */}
        <div className="border-t border-white/5 pt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Scalp params</span>
            <span className="font-mono">SL: ATR×1.0 · TP: SL×1.5 · R:R 1:1.5</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
            <span>Cooldown</span>
            <span className="font-mono">15 min between signals</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
