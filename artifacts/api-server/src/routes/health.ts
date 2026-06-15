import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getTwelveDataStatus } from "../lib/twelveDataStream.js";
import { getLatestPrice } from "../lib/priceEvents.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/status", (_req, res) => {
  const td = getTwelveDataStatus();
  const activeSource = getLatestPrice()?.source ?? null;
  res.json({
    twelvedata: {
      connected: td.connected,
      lastTickMs: td.lastTickMs,
      msSinceLastTick: td.msSinceLastTick,
      reconnectCount: td.reconnectCount,
    },
    activeSource,
    serverTime: Date.now(),
  });
});

export default router;
