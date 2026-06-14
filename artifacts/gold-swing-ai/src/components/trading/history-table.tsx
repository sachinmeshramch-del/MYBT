import { useState } from "react";
import { useGetHistory, useDeleteSignal, useClearHistory } from "@workspace/api-client-react";
import { usePriceStream } from "@/hooks/usePriceStream";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown, Clock, Trash2 } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { formatPrice } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const IST = "Asia/Kolkata";

function toIST12(ts: string) {
  try {
    return formatInTimeZone(new Date(ts), IST, "dd MMM, hh:mm a");
  } catch {
    return "—";
  }
}

type TradeStatus = "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD";

function StatusBadge({ status }: { status: TradeStatus }) {
  if (status === "TARGET_HIT")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/30 whitespace-nowrap">
        ✅ TARGET HIT
      </span>
    );
  if (status === "STOP_HIT")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-destructive/15 text-destructive border border-destructive/30 whitespace-nowrap">
        ❌ STOP LOSS
      </span>
    );
  if (status === "RUNNING")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 animate-pulse whitespace-nowrap">
        ⏳ RUNNING
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/5 text-muted-foreground border border-white/10">
      — HOLD
    </span>
  );
}

function PnlCell({
  signal, status, pnlPoints, entryPrice, currentPrice,
}: {
  signal: "LONG" | "SHORT" | "HOLD";
  status: TradeStatus;
  pnlPoints?: number;
  entryPrice: number;
  currentPrice: number;
}) {
  if (signal === "HOLD") return <span className="text-muted-foreground">—</span>;

  let pts: number;
  let isClosed = false;

  if (status === "TARGET_HIT" || status === "STOP_HIT") {
    pts = pnlPoints ?? 0;
    isClosed = true;
  } else {
    pts = signal === "LONG" ? currentPrice - entryPrice : entryPrice - currentPrice;
  }

  const positive = pts >= 0;
  const color = positive ? "text-success" : "text-destructive";
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-semibold ${color}`}>
      <Icon className="w-3 h-3" />
      {positive ? "+" : ""}{pts.toFixed(2)}
      {!isClosed && <span className="text-[10px] opacity-60 font-sans">live</span>}
    </span>
  );
}

function DurationCell({ timestamp, closedAt }: { timestamp: string; closedAt?: string }) {
  const start = new Date(timestamp);
  const end = closedAt ? new Date(closedAt) : new Date();
  try {
    return (
      <span className="text-muted-foreground text-xs font-sans whitespace-nowrap">
        {formatDistanceStrict(start, end)}
      </span>
    );
  } catch {
    return <span className="text-muted-foreground">—</span>;
  }
}

function DeleteButton({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={() => onDelete(id)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 transition-colors font-semibold"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete signal"
      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/30 transition-all duration-150"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

export function HistoryTable() {
  const { data, isLoading, isError, refetch } = useGetHistory({
    query: { refetchInterval: 10000 },
  });
  const { data: priceData } = usePriceStream();
  const currentPrice = priceData?.price ?? 0;

  const { mutate: deleteSignal } = useDeleteSignal();
  const { mutate: clearHistory, isPending: isClearing } = useClearHistory();
  const [confirmClear, setConfirmClear] = useState(false);

  function handleDelete(id: string) {
    deleteSignal(
      { id },
      { onSuccess: () => refetch(), onError: () => refetch() }
    );
  }

  function handleClearAll() {
    clearHistory(undefined, {
      onSuccess: () => { refetch(); setConfirmClear(false); },
      onError:   () => setConfirmClear(false),
    });
  }

  if (isError) return null;

  const signals = data?.signals ?? [];

  return (
    <Card className="border-white/5 bg-card/50 overflow-hidden">
      <CardHeader className="pb-4 border-b border-white/5 bg-black/20">
        <CardTitle className="text-lg flex items-center gap-2 flex-wrap gap-y-2">
          <History className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          Signal History
          <span className="text-xs font-normal text-muted-foreground/60 font-mono">(IST · latest first)</span>

          <div className="ml-auto flex items-center gap-3">
            {currentPrice > 0 && (
              <span className="text-xs font-mono font-normal text-muted-foreground">
                Live: <span className="text-foreground">{formatPrice(currentPrice)}</span>
              </span>
            )}

            {/* Clear All button */}
            {signals.length > 0 && (
              confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Clear all {signals.length} records?</span>
                  <button
                    onClick={handleClearAll}
                    disabled={isClearing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/80 transition-colors disabled:opacity-50"
                  >
                    {isClearing ? "Clearing…" : "Yes, Clear All"}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-white/10 hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-all duration-150"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear History
                </button>
              )
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/40 border-b border-white/5">
              <tr>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Date &amp; Time (IST)</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Signal</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Status</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Entry</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Stop Loss</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Take Profit</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">P&amp;L (pts)</th>
                <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Duration</th>
                <th className="px-4 py-3 font-semibold tracking-wider">Conf.</th>
                <th className="px-4 py-3 font-semibold tracking-wider text-center">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-16 bg-white/5" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                signals.map((row) => {
                  const status = (row.tradeStatus ?? "RUNNING") as TradeStatus;
                  return (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap font-mono">
                        {toIST12(row.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          row.signal === "LONG" ? "success" :
                          row.signal === "SHORT" ? "destructive" : "warning"
                        }>
                          {row.signal}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 text-foreground font-semibold">
                        {formatPrice(row.entryPrice)}
                      </td>
                      <td className="px-4 py-3 text-destructive/80">
                        {formatPrice(row.stopLoss)}
                      </td>
                      <td className="px-4 py-3 text-success/80">
                        {formatPrice(row.takeProfit)}
                      </td>
                      <td className="px-4 py-3">
                        <PnlCell
                          signal={row.signal}
                          status={status}
                          pnlPoints={row.pnlPoints}
                          entryPrice={row.entryPrice}
                          currentPrice={currentPrice}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <DurationCell timestamp={row.timestamp} closedAt={row.closedAt} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.confidence}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <DeleteButton id={row.id} onDelete={handleDelete} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {signals.length === 0 && !isLoading && (
            <div className="p-8 text-center text-muted-foreground">
              No signal history yet. Signals will appear here once generated.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
