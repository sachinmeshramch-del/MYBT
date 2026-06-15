import { Header } from "@/components/layout/header";
import { ChartWidget } from "@/components/trading/chart-widget";
import { SignalPanel } from "@/components/trading/signal-panel";
import { IndicatorsRow } from "@/components/trading/indicators-row";
import { HistoryTable } from "@/components/trading/history-table";
import { AnalyticsPanel } from "@/components/trading/analytics-panel";
import { motion } from "framer-motion";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-grow flex flex-col">

        {/* ── Top Section: Chart + Signal Panel ───────────────────────────── */}
        {/* Mobile: stacked full-width, no padding. Desktop: side-by-side with padding */}
        <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-6 lg:px-6 lg:pt-6">

          <motion.div
            className="lg:col-span-7 xl:col-span-8 h-[420px] sm:h-[500px] lg:h-auto lg:min-h-[560px]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ChartWidget />
          </motion.div>

          <motion.div
            className="lg:col-span-5 xl:col-span-4 px-0 lg:px-0"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <SignalPanel />
          </motion.div>
        </div>

        {/* ── Below sections: padded on all screen sizes ──────────────────── */}
        <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-6">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <HistoryTable />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <IndicatorsRow />
          </motion.div>

          <motion.div
            className="pb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            <AnalyticsPanel />
          </motion.div>

        </div>

      </main>
    </div>
  );
}
