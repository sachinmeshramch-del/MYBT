import { useEffect, useState, useRef } from "react";

export interface TwelveDataStatus {
  connected: boolean;
  lastTickMs: number;
  msSinceLastTick: number;
  reconnectCount: number;
}

export interface ApiStatus {
  twelvedata: TwelveDataStatus;
  activeSource: string | null;
  serverTime: number;
}

export interface ApiStatusState {
  status: ApiStatus | null;
  ok: boolean;
  lastChecked: number | null;
  alerting: boolean;
}

const POLL_INTERVAL_MS = 10_000;
const STALE_TICK_THRESHOLD_MS = 60_000;

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

        const tdOk =
          data.twelvedata.connected &&
          (data.twelvedata.msSinceLastTick < STALE_TICK_THRESHOLD_MS ||
            data.twelvedata.msSinceLastTick === -1);

        const alerting = !tdOk;

        if (!cancelled) {
          prevOkRef.current = tdOk;
          setState({ status: data, ok: tdOk, lastChecked: Date.now(), alerting });
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
