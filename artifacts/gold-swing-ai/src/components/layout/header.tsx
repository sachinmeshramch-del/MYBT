import { Activity, TrendingUp, TrendingDown, Wifi, WifiOff } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { useApiStatus } from "@/hooks/useApiStatus";
import { cn } from "@/lib/utils";

function formatNum(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function splitPrice(price: number) {
  const [int, dec] = price.toFixed(2).split(".");
  return { int: int.replace(/\B(?=(\d{3})+(?!\d))/g, ","), dec };
}

function formatStaleness(ms: number): string {
  if (ms < 0) return "no ticks yet";
  if (ms < 1000) return `${ms}ms ago`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60000)}m ago`;
}

interface SourceRowProps {
  label: string;
  connected: boolean;
  hasKey: boolean;
  msSinceLastTick?: number;
  isActive?: boolean;
}

function SourceRow({ label, connected, hasKey, msSinceLastTick, isActive }: SourceRowProps) {
  let dotColor = "#ef4444";
  let stateText = "NO API KEY";
  let stateColor = "#ef4444";

  if (!hasKey) {
    dotColor = "#ef4444";
    stateText = "NO API KEY";
    stateColor = "#ef4444";
  } else if (connected) {
    dotColor = "#22c55e";
    stateText = isActive ? "LIVE ★" : "CONNECTED";
    stateColor = "#22c55e";
  } else {
    dotColor = "#f59e0b";
    stateText = "CONNECTING…";
    stateColor = "#f59e0b";
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="text-[10px] font-mono text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {msSinceLastTick !== undefined && connected && (
          <span className="text-[9px] font-mono text-muted-foreground/50">{formatStaleness(msSinceLastTick)}</span>
        )}
        <span className="text-[10px] font-mono font-bold" style={{ color: stateColor }}>{stateText}</span>
      </div>
    </div>
  );
}

export function Header() {
  const { data, connected, error, transport } = usePriceStream();
  const { status, alerting } = useApiStatus();
  const [flashClass, setFlashClass] = useState("");
  const prevPriceRef = useRef<number | null>(null);
  const [blinkOn, setBlinkOn] = useState(true);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setBlinkOn(v => !v), 600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!data) return;
    if (prevPriceRef.current === null) {
      prevPriceRef.current = data.price;
      return;
    }
    if (data.price !== prevPriceRef.current) {
      const cls = data.direction === "up" ? "flash-up" : data.direction === "down" ? "flash-down" : "";
      prevPriceRef.current = data.price;
      if (cls) {
        setFlashClass(cls);
        const t = setTimeout(() => setFlashClass(""), 350);
        return () => clearTimeout(t);
      }
    }
  }, [data?.price, data?.direction]);

  const isUp = (data?.change ?? 0) >= 0;

  const td = status?.twelvedata;
  const fh = status?.finnhub;
  const gp = status?.goldprice;
  const activeSource = status?.activeSource ?? data?.source ?? null;

  const hasPremium = td?.connected || fh?.connected;

  let sourceBadgeColor = "#6b7280";
  let sourceBadgeLabel = "LIVE";
  if (data?.source === "twelvedata") { sourceBadgeColor = "#22c55e"; sourceBadgeLabel = "LIVE · TwelveData"; }
  else if (data?.source === "finnhub") { sourceBadgeColor = "#22c55e"; sourceBadgeLabel = "LIVE · Finnhub"; }
  else if (data?.source === "goldprice") { sourceBadgeColor = "#f59e0b"; sourceBadgeLabel = "POLLED · 2s"; }
  else if (data?.source === "yahoo") { sourceBadgeColor = "#6b7280"; sourceBadgeLabel = "DELAYED · Yahoo"; }

  return (
    <>
      <style>{`
        .flash-up   { animation: flash-green 0.35s ease-out; }
        .flash-down { animation: flash-red   0.35s ease-out; }
        @keyframes flash-green {
          0%   { background-color: rgba(34,197,94,0.25); }
          100% { background-color: transparent; }
        }
        @keyframes flash-red {
          0%   { background-color: rgba(239,68,68,0.25); }
          100% { background-color: transparent; }
        }
        @keyframes pulse-alert {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        .pulse-alert { animation: pulse-alert 1.4s ease-in-out infinite; }
      `}</style>

      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#0d0f14] backdrop-blur-xl">
        <div className="container mx-auto px-4 h-[72px] flex items-center justify-between gap-4">

          {/* ── Brand ───────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Activity className="text-black w-5 h-5" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold tracking-tight text-foreground leading-none">Gold Scalp AI</h1>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className="w-2 h-2 rounded-full transition-colors duration-200"
                  style={{ backgroundColor: blinkOn && connected ? "#22c55e" : connected ? "#16a34a" : "#ef4444" }}
                />
                <span
                  className="text-[10px] font-mono tracking-widest uppercase"
                  style={{ color: !connected ? "#ef4444" : sourceBadgeColor }}
                >
                  XAUUSD · {!connected ? (error ? "RECONNECTING..." : "CONNECTING…") : sourceBadgeLabel}
                </span>
              </div>
            </div>
          </div>

          {/* ── Bid / Ask block ──────────────────────────────────────────── */}
          <div className={cn("flex items-stretch gap-px rounded-xl overflow-hidden border border-white/8 shrink-0", flashClass)}>
            <div className="flex flex-col items-center justify-center bg-[#0a1a0f] px-4 py-2 min-w-[110px]">
              <span className="text-[9px] font-bold tracking-[0.2em] text-green-400/60 uppercase mb-0.5">BID</span>
              {data ? (
                <span className="font-mono font-bold leading-none tabular-nums text-green-400">
                  <span className="text-xl">{splitPrice(data.bid).int}.</span>
                  <span className="text-2xl">{splitPrice(data.bid).dec}</span>
                </span>
              ) : (
                <span className="font-mono text-xl font-bold text-green-400/30 animate-pulse">――――</span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center bg-[#111318] px-3 py-2">
              <span className="text-[9px] font-bold tracking-[0.15em] text-muted-foreground/60 uppercase mb-0.5">SPREAD</span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {data ? data.spread.toFixed(2) : "0.35"}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center bg-[#1a0a0a] px-4 py-2 min-w-[110px]">
              <span className="text-[9px] font-bold tracking-[0.2em] text-red-400/60 uppercase mb-0.5">ASK</span>
              {data ? (
                <span className="font-mono font-bold leading-none tabular-nums text-red-400">
                  <span className="text-xl">{splitPrice(data.ask).int}.</span>
                  <span className="text-2xl">{splitPrice(data.ask).dec}</span>
                </span>
              ) : (
                <span className="font-mono text-xl font-bold text-red-400/30 animate-pulse">――――</span>
              )}
            </div>
          </div>

          {/* ── Change + 24H stats ───────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            {data ? (
              <>
                <div className="flex flex-col items-end">
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-bold font-mono tabular-nums",
                    isUp ? "text-green-400" : "text-red-400"
                  )}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {data.change > 0 ? "+" : ""}{formatNum(data.change)} ({data.changePercent > 0 ? "+" : ""}{data.changePercent.toFixed(2)}%)
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                    {new Date(data.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>

                <div className="hidden md:flex flex-col text-[11px] font-mono text-muted-foreground gap-1 border-l border-white/8 pl-5">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground/60">24H HIGH</span>
                    <span className="text-foreground tabular-nums">{formatNum(data.high24h)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground/60">24H LOW</span>
                    <span className="text-foreground tabular-nums">{formatNum(data.low24h)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {error ? (
                  <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400 text-xs">No connection</span></>
                ) : (
                  <><Wifi className="w-4 h-4 animate-pulse" /><span className="text-xs animate-pulse">Connecting to live feed…</span></>
                )}
              </div>
            )}

            {/* ── Data Source Status Badge ─────────────────────────────── */}
            <div
              className="relative shrink-0"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl border cursor-default select-none transition-all",
                  alerting
                    ? "border-amber-500/60 bg-amber-500/10 pulse-alert"
                    : "border-emerald-500/40 bg-emerald-500/10"
                )}
              >
                <span
                  className={cn("w-2 h-2 rounded-full shrink-0", !alerting && "animate-pulse")}
                  style={{ backgroundColor: alerting ? "#f59e0b" : "#22c55e" }}
                />
                <div className="flex flex-col leading-none">
                  <span className={cn(
                    "text-[9px] font-bold tracking-widest uppercase",
                    alerting ? "text-amber-400/70" : "text-emerald-400/70"
                  )}>DATA SOURCE</span>
                  <span className={cn(
                    "text-[11px] font-black tracking-wide font-mono mt-0.5 uppercase",
                    alerting ? "text-amber-300" : "text-white"
                  )}>
                    {hasPremium
                      ? (td?.connected ? "TwelveData" : "Finnhub")
                      : activeSource === "goldprice"
                        ? "Polling 2s"
                        : activeSource?.toUpperCase() ?? "—"
                    }
                  </span>
                </div>
              </div>

              {/* ── Expanded tooltip with all 3 sources ────────────────── */}
              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-[#111318] shadow-2xl p-4 z-50 space-y-3">
                  <div className="text-muted-foreground/60 uppercase tracking-wider text-[9px] font-bold border-b border-white/8 pb-2">
                    Live Data Sources
                  </div>

                  <SourceRow
                    label="TwelveData WS (primary)"
                    connected={td?.connected ?? false}
                    hasKey={td?.hasApiKey ?? false}
                    msSinceLastTick={td?.msSinceLastTick}
                    isActive={activeSource === "twelvedata"}
                  />
                  <SourceRow
                    label="Finnhub WS (backup)"
                    connected={fh?.connected ?? false}
                    hasKey={fh?.hasApiKey ?? false}
                    msSinceLastTick={fh?.msSinceLastTick}
                    isActive={activeSource === "finnhub"}
                  />
                  <SourceRow
                    label="GoldPrice.org (2s poll)"
                    connected={true}
                    hasKey={true}
                    isActive={activeSource === "goldprice"}
                  />

                  <div className="border-t border-white/8 pt-2.5 space-y-1.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">Browser WS</span>
                      <span className={connected ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                        {connected ? `● ${transport.toUpperCase()}` : "✕ OFFLINE"}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted-foreground">OHLC (candles)</span>
                      <span className="text-amber-400 font-bold">Yahoo Finance</span>
                    </div>
                  </div>

                  {alerting && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[10px] font-mono text-amber-300 leading-relaxed">
                      ⚠ No premium WS key detected.<br />
                      Add <span className="text-white font-bold">FINNHUB_API_KEY</span> (free) for<br />
                      sub-second real-time ticks.
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      </header>
    </>
  );
}
