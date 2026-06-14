import { Router, type IRouter, type Request, type Response } from "express";
import { fetchGoldPrice } from "../lib/goldPrice.js";
import { generateSignal, initSignalCooldown } from "../lib/signalEngine.js";
import { startTradeTracker } from "../lib/tradeTracker.js";
import { getAnalyticsSummary, setSmartMode } from "../lib/performanceAnalytics.js";
import { priceEmitter, getLatestPrice, type LivePrice } from "../lib/priceEvents.js";
import { broadcastToWebSocketClients } from "../lib/priceWebSocket.js";
import { db, signalsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// Start background trade outcome tracker
startTradeTracker();
// Restore 15-min inter-signal cooldown from DB so restarts don't reset it
initSignalCooldown().catch((err) => logger.warn({ err }, "Signal cooldown init failed"));

const router: IRouter = Router();

// ── SSE streaming ─────────────────────────────────────────────────────────
const sseClients = new Set<Response>();

priceEmitter.on("price", (data: LivePrice) => {
  broadcastToWebSocketClients(data);

  if (sseClients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
});

router.get("/price/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  sseClients.add(res);
  logger.info({ total: sseClients.size }, "SSE client connected");

  const current = getLatestPrice();
  if (current) {
    res.write(`data: ${JSON.stringify(current)}\n\n`);
  }

  req.on("close", () => {
    sseClients.delete(res);
    logger.info({ total: sseClients.size }, "SSE client disconnected");
  });
});

// ── REST price endpoint ────────────────────────────────────────────────────
router.get("/price", async (req, res) => {
  try {
    const live = getLatestPrice();
    if (live) {
      res.json(live);
    } else {
      const priceData = await fetchGoldPrice();
      res.json(priceData);
    }
  } catch (err) {
    req.log.error({ err }, "Error fetching price");
    res.status(500).json({ error: "price_fetch_error", message: "Failed to fetch gold price" });
  }
});

// ── Signal endpoint ────────────────────────────────────────────────────────
router.get("/signal", async (req, res) => {
  try {
    const live  = getLatestPrice();
    const price = live?.price ?? (await fetchGoldPrice()).price;
    const signal = await generateSignal(price);

    if (signal.signal !== "HOLD") {
      try {
        await db.insert(signalsTable).values({
          signal:        signal.signal,
          confidence:    signal.confidence,
          entryPrice:    signal.entryPrice,
          stopLoss:      signal.stopLoss,
          takeProfit:    signal.takeProfit,
          trend:         signal.trend,
          reason:        signal.reason,
          tradeDuration: signal.tradeDuration,
        });
      } catch (dbErr) {
        req.log.warn({ dbErr }, "Failed to persist signal to DB");
      }
    }

    res.json(signal);
  } catch (err) {
    req.log.error({ err }, "Error generating signal");
    res.status(500).json({ error: "signal_error", message: "Failed to generate trading signal" });
  }
});

// ── History endpoint ───────────────────────────────────────────────────────
router.get("/history", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(signalsTable)
      .orderBy(desc(signalsTable.createdAt))
      .limit(50);

    const signals = rows.map(r => ({
      id:            String(r.id),
      signal:        r.signal as "LONG" | "SHORT" | "HOLD",
      confidence:    r.confidence,
      entryPrice:    r.entryPrice,
      stopLoss:      r.stopLoss,
      takeProfit:    r.takeProfit,
      trend:         r.trend as "BULLISH" | "BEARISH" | "NEUTRAL",
      reason:        r.reason,
      timestamp:     r.createdAt.toISOString(),
      tradeDuration: r.tradeDuration,
      tradeStatus:   (r.tradeStatus ?? "RUNNING") as "RUNNING" | "TARGET_HIT" | "STOP_HIT" | "HOLD",
      closedPrice:   r.closedPrice ?? undefined,
      closedAt:      r.closedAt ? r.closedAt.toISOString() : undefined,
      pnlPoints:     r.pnlPoints ?? undefined,
    }));

    res.json({ signals });
  } catch (err) {
    req.log.error({ err }, "Error fetching history");
    res.json({ signals: [] });
  }
});

// ── Clear all history ──────────────────────────────────────────────────────
router.delete("/history/clear", async (req, res) => {
  try {
    const deleted = await db.delete(signalsTable).returning();
    res.json({ deleted: deleted.length });
  } catch (err) {
    req.log.error({ err }, "Error clearing history");
    res.status(500).json({ error: "clear_error", message: "Failed to clear history" });
  }
});

// ── Delete signal ──────────────────────────────────────────────────────────
router.delete("/history/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid_id", message: "ID must be a number" });
    return;
  }
  try {
    const deleted = await db
      .delete(signalsTable)
      .where(eq(signalsTable.id, id))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "not_found", message: "Signal not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Error deleting signal");
    res.status(500).json({ error: "delete_error", message: "Failed to delete signal" });
  }
});

// ── Analytics endpoints ────────────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const analytics = await getAnalyticsSummary();
    res.json(analytics);
  } catch (err) {
    req.log.error({ err }, "Error fetching analytics");
    res.status(500).json({ error: "analytics_error", message: "Failed to fetch analytics" });
  }
});

router.post("/analytics/smart-mode", async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "validation_error", message: "enabled must be a boolean" });
    return;
  }
  setSmartMode(enabled);
  const analytics = await getAnalyticsSummary(true);
  res.json(analytics);
});

export default router;
