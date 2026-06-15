import { Activity, TrendingUp, TrendingDown, Wifi, WifiOff, AlertTriangle } from "lucide-react";
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

export function Header() {
  const { data, connected, error, transport } = usePriceStream();
  const { status, ok, alerting } = useApiStatus();
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
                  style={{
                    color: !connected
                      ? "#ef4444"
                      : data?.source === "twelvedata"
                        ? "#22c55e"
                        : data?.source === "finnhub"
                          ? "#eab308"
                          : "#6b7280",
                  }}
                >
                  XAUUSD · {!connected
                    ? (error ? "RECONNECTING..." : "CONNECTING…")
                    : data?.source === "twelvedata"
                      ? "LIVE · TwelveData"
                      : data?.source === "finnhub"
                        ? "LIVE · Finnhub backup"
                        : "LIVE"}
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

            {/* ── TwelveData Health Badge ──────────────────────────────── */}
            <div
              className="relative shrink-0"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <div
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-default select-none transition-all",
                  alerting
                    ? "border-red-500 bg-red-500/15 shadow-lg shadow-red-500/30 pulse-alert"
                    : ok
                      ? "border-emerald-500/70 bg-emerald-500/15 shadow-lg shadow-emerald-500/20"
                      : "border-yellow-500/60 bg-yellow-500/12 shadow-lg shadow-yellow-500/20"
                )}
              >
                {alerting ? (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <span
                    className={cn("w-2.5 h-2.5 rounded-full shrink-0", ok && "animate-pulse")}
                    style={{ backgroundColor: ok ? "#22c55e" : "#eab308" }}
                  />
                )}
                <div className="flex flex-col leading-none">
                  <span className={cn(
                    "text-[11px] font-black tracking-widest uppercase",
                    alerting ? "text-red-400" : ok ? "text-emerald-400" : "text-yellow-400"
                  )}>
                    TwelveData
                  </span>
                  <span className={cn(
                    "text-[13px] font-black tracking-wide font-mono mt-0.5",
                    alerting ? "text-red-300" : ok ? "text-white" : "text-yellow-300"
                  )}>
                    {alerting ? "⚠ DISCONNECTED" : ok ? "● CONNECTED" : "CHECKING…"}
                  </span>
                </div>
              </div>

              {/* Tooltip */}
              {showTooltip && (
                <div className="absolute right-0 top-full mt-2 w-60 rounded-xl border border-white/10 bg-[#111318] shadow-2xl p-4 z-50 text-[11px] font-mono space-y-2.5">
                  <div className="text-muted-foreground/60 uppercase tracking-wider text-[9px] font-bold border-b border-white/8 pb-2">
                    TwelveData WS Status
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Connection</span>
                    <span className={cn("font-bold", td?.connected ? "text-emerald-400" : "text-red-400")}>
                      {td?.connected ? "● LIVE" : "✕ DOWN"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Last Tick</span>
                    <span className="text-foreground tabular-nums">
                      {td ? formatStaleness(td.msSinceLastTick) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Reconnects</span>
                    <span className={cn("font-bold", td && td.reconnectCount > 0 ? "text-yellow-400" : "text-emerald-400")}>
                      {td?.reconnectCount ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Active Source</span>
                    <span className="text-amber-400 uppercase font-bold">{status?.activeSource ?? "—"}</span>
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </header>
    </>
  );
}
