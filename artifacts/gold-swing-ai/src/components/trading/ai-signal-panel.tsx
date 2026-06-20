import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  TrendingUp, TrendingDown, Minus, Bot, RefreshCw, AlertTriangle,
  ChevronDown, ChevronUp, Zap, Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AIAnalysis {
  trend:             string;
  momentum:          string;
  supportResistance: string;
  patterns:          string;
  fundamentals:      string;
  volatility:        string;
  session:           string;
}

interface AISignalResult {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function decisionStyles(decision: AISignalResult["decision"]) {
  switch (decision) {
    case "BUY":   return { bg: "bg-emerald-500/15 border-emerald-500/40", text: "text-emerald-400", badge: "border-emerald-500/50 text-emerald-400", icon: TrendingUp  };
    case "SHORT": return { bg: "bg-red-500/15     border-red-500/40",     text: "text-red-400",     badge: "border-red-500/50     text-red-400",     icon: TrendingDown };
    case "BLOCK": return { bg: "bg-orange-500/15  border-orange-500/40",  text: "text-orange-400",  badge: "border-orange-500/50  text-orange-400",  icon: Shield       };
    default:      return { bg: "bg-slate-500/10   border-slate-500/25",   text: "text-slate-400",   badge: "border-slate-500/40   text-slate-400",   icon: Minus        };
  }
}

function ConfidenceBar({ confidence, decision }: { confidence: number; decision: AISignalResult["decision"] }) {
  const color = decision === "BUY" ? "bg-emerald-500" : decision === "SHORT" ? "bg-red-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className={`text-sm font-bold font-mono w-10 text-right ${confidence >= 70 ? "text-emerald-400" : confidence >= 60 ? "text-amber-400" : "text-slate-400"}`}>
        {confidence}%
      </span>
    </div>
  );
}

const ANALYSIS_LABELS: { key: keyof AIAnalysis; label: string }[] = [
  { key: "trend",             label: "Trend"          },
  { key: "momentum",          label: "Momentum"       },
  { key: "supportResistance", label: "S/R Zones"      },
  { key: "patterns",          label: "Patterns"       },
  { key: "fundamentals",      label: "Fundamentals"   },
  { key: "volatility",        label: "Volatility"     },
  { key: "session",           label: "Session"        },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export function AISignalPanel() {
  const queryClient = useQueryClient();
  const [showAnalysis, setShowAnalysis] = useState(true);

  const { data: signal, isLoading, isError } = useQuery<AISignalResult>({
    queryKey:        ["ai-signal"],
    queryFn:         async () => {
      const res = await fetch("/api/ai-signal");
      if (!res.ok) throw new Error("Failed to fetch AI signal");
      return res.json() as Promise<AISignalResult>;
    },
    refetchInterval: 5 * 60 * 1000,  // 5 minutes
    staleTime:       5 * 60 * 1000,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai-signal/generate", { method: "POST" });
      if (!res.ok) throw new Error("Generate failed");
      return res.json() as Promise<AISignalResult>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["ai-signal"], data);
    },
  });

  if (isLoading) {
    return (
      <Card className="border-white/10 bg-gradient-to-b from-card to-background">
        <CardContent className="p-6 flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !signal) {
    return (
      <Card className="border-white/10 bg-gradient-to-b from-card to-background">
        <CardContent className="p-6 flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm">Failed to load AI signal analysis</span>
        </CardContent>
      </Card>
    );
  }

  const styles = decisionStyles(signal.decision);
  const Icon   = styles.icon;
  const hasPosition = signal.decision === "BUY" || signal.decision === "SHORT";

  return (
    <Card className="relative overflow-hidden border-white/10 bg-gradient-to-b from-card to-background shadow-2xl">
      <CardContent className="p-6 lg:p-8 flex flex-col gap-5 relative z-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-purple-400" />
              <h2 className="text-xs font-medium text-slate-300 uppercase tracking-widest">
                AI Signal Analysis · Claude
              </h2>
              <Badge
                variant="outline"
                className={`text-[10px] px-2 py-0 border ${signal.source === "claude" ? "border-purple-500/40 text-purple-400" : "border-slate-500/40 text-slate-400"}`}
              >
                {signal.source === "claude" ? "🟣 Claude AI" : "🔘 Mock"}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 font-mono">ID: {signal.signalId}</p>
          </div>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/10 hover:border-purple-500/40 hover:bg-purple-500/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generate.isPending ? "animate-spin" : ""}`} />
            {generate.isPending ? "Analysing…" : "Generate Now"}
          </button>
        </div>

        {/* ── Decision card ────────────────────────────────────────────────── */}
        <motion.div
          key={signal.signalId}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-2xl border p-5 ${styles.bg}`}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/30 ${styles.text}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className={`text-2xl font-black tracking-tight ${styles.text}`}>
                  {signal.decision === "BUY" ? "🟢 BUY" : signal.decision === "SHORT" ? "🔴 SHORT" : signal.decision === "BLOCK" ? "🚫 BLOCK" : "⏸ WAIT"}
                </div>
                <div className="text-xs text-slate-400">
                  {signal.decision === "BUY" ? "Enter long position" : signal.decision === "SHORT" ? "Enter short position" : signal.decision === "BLOCK" ? "Avoid trading — risks outweigh reward" : "No high-probability setup — stand aside"}
                </div>
              </div>
            </div>
            {signal.confidence > 0 && (
              <div className="text-right">
                <div className="text-xs text-slate-400 mb-1">Confidence</div>
                <div className={`text-xl font-black font-mono ${signal.confidence >= 70 ? "text-emerald-400" : signal.confidence >= 60 ? "text-amber-400" : "text-slate-400"}`}>
                  {signal.confidence}%
                </div>
              </div>
            )}
          </div>

          {signal.confidence > 0 && (
            <ConfidenceBar confidence={signal.confidence} decision={signal.decision} />
          )}
        </motion.div>

        {/* ── Entry / SL / TP ─────────────────────────────────────────────── */}
        {hasPosition && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/8 bg-black/30 p-3 text-center">
              <div className="text-[10px] text-slate-400 mb-1">ENTRY</div>
              <div className="text-sm font-bold text-white font-mono">${signal.entryPrice.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-center">
              <div className="text-[10px] text-red-400 mb-1">STOP LOSS</div>
              <div className="text-sm font-bold text-red-400 font-mono">${signal.stopLoss.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {Math.abs(signal.entryPrice - signal.stopLoss).toFixed(2)} pts
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
              <div className="text-[10px] text-emerald-400 mb-1">TAKE PROFIT</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">${signal.takeProfit.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">R:R 1:{signal.riskRewardRatio}</div>
            </div>
          </div>
        )}

        {/* ── Analysis breakdown ───────────────────────────────────────────── */}
        <div className="bg-black/25 rounded-2xl border border-white/8 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 uppercase tracking-widest hover:text-white transition-colors"
            onClick={() => setShowAnalysis(!showAnalysis)}
          >
            <span>AI Analysis Breakdown</span>
            {showAnalysis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <AnimatePresence>
            {showAnalysis && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                className="overflow-hidden"
              >
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {ANALYSIS_LABELS.map(({ key, label }) => (
                    <div key={key} className="px-4 py-2.5 flex gap-3">
                      <span className="text-[11px] text-slate-500 font-medium w-24 flex-shrink-0 pt-0.5">{label}</span>
                      <span className="text-[11px] text-slate-300 leading-relaxed">{signal.analysis[key]}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Key reasons & risks ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {signal.keyReasons.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Key Reasons</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {signal.keyReasons.map((r, i) => (
                  <li key={i} className="text-[11px] text-slate-300 flex gap-2">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {signal.risks.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Risks</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {signal.risks.map((r, i) => (
                  <li key={i} className="text-[11px] text-slate-300 flex gap-2">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Alternative scenario + next trigger ──────────────────────────── */}
        {(signal.alternativeScenario || signal.nextTrigger) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {signal.alternativeScenario && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <div className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-1">Alternative Scenario</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{signal.alternativeScenario}</p>
              </div>
            )}
            {signal.nextTrigger && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Next Trigger</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{signal.nextTrigger}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/5">
          <div className="flex items-center gap-2">
            {signal.source === "mock" && (
              <span className="text-amber-400 text-[10px]">
                ⚠ Mock mode — add <code className="bg-white/5 px-1 rounded">ANTHROPIC_API_KEY</code> secret for real AI
              </span>
            )}
          </div>
          <span className="font-mono">
            {signal.timestamp && !isNaN(new Date(signal.timestamp).getTime())
              ? format(new Date(signal.timestamp), "HH:mm:ss")
              : "--:--:--"}
          </span>
        </div>

      </CardContent>
    </Card>
  );
}
