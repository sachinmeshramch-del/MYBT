import { useEffect, useState, useRef } from "react";

export interface SourceStatus {
  connected: boolean;
  hasApiKey: boolean;
  lastTickMs: number;
  msSinceLastTick: number;
  reconnectCount: number;
}

export interface GoldpriceStatus {
  active: boolean;
  pollingIntervalMs: number;
}

export interface ApiStatus {
  twelvedata: SourceStatus;
  finnhub: SourceStatus;
  goldprice: GoldpriceStatus;
  activeSource: string | null;
  serverTime: number;
}

export interface ApiStatusState {
  status: ApiStatus | null;
  ok: boolean;
  lastChecked: number | null;
  alerting: boolean;
}

const POLL_INTERVAL_MS = 8_000;

export function useApiStatus(): ApiStatusState {
  const [state, setState] = useState<ApiStatusState>({
    status: null,
    ok: true,
    lastChecked: null,
    alerting: false,
  });
  const prevOkRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ApiStatus = await res.json();

        const hasRealtime = data.twelvedata.connected || data.finnhub.connected;
        const alerting = !hasRealtime;

        if (!cancelled) {
          prevOkRef.current = hasRealtime;
          setState({ status: data, ok: hasRealtime, lastChecked: Date.now(), alerting });
        }
      } catch {
        if (!cancelled) {
          setState(prev => ({ ...prev, ok: false, alerting: true, lastChecked: Date.now() }));
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return state;
}
