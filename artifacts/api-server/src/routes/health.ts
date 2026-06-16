import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getTwelveDataStatus } from "../lib/twelveDataStream.js";
import { getFinnhubStatus } from "../lib/polygonStream.js";
import { getLatestPrice } from "../lib/priceEvents.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/status", (_req, res) => {
  const td = getTwelveDataStatus();
  const fh = getFinnhubStatus();
  const latest = getLatestPrice();
  const activeSource = latest?.source ?? null;
  res.json({
    twelvedata: {
      connected: td.connected,
      hasApiKey: !!process.env["TWELVEDATA_API_KEY"] || !!process.env["POLYGON_API_KEY"],
      lastTickMs: td.lastTickMs,
      msSinceLastTick: td.msSinceLastTick,
      reconnectCount: td.reconnectCount,
    },
    finnhub: {
      connected: fh.connected,
      hasApiKey: fh.hasApiKey,
      lastTickMs: fh.lastTickMs,
      msSinceLastTick: fh.msSinceLastTick,
      reconnectCount: fh.reconnectCount,
    },
    goldprice: {
      active: activeSource === "goldprice",
      pollingIntervalMs: 2000,
    },
    activeSource,
    serverTime: Date.now(),
  });
});

export default router;
