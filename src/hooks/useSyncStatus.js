// src/hooks/useSyncStatus.js
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

// Optional: set VITE_APP_OFFLINE=true in .env.local to skip SPARQL during local dev
const OFFLINE = import.meta.env?.VITE_APP_OFFLINE === "true";

// Canonical, i18n-friendly status codes (no UI strings in the hook)
export const SYNC_STATUS = {
  OFFLINE: "offline",
  CHECKING: "checking",
  SYNCING: "syncing",
  SYNCED: "synced",
  UNKNOWN: "unknown",
};

// Dev/StrictMode singleton to avoid double loops
function getSingleton() {
  if (typeof window === "undefined") return { running: false };
  if (!window.__APP_SYNC_SINGLETON__) {
    window.__APP_SYNC_SINGLETON__ = { running: false };
  }
  return window.__APP_SYNC_SINGLETON__;
}

/**
 * Health + sync polling with circuit breaker & backoff.
 */
export default function useSyncStatus(authFetch) {
  const location = useLocation();
  const [healthOnline, setHealthOnline] = useState(null);
  const [indexedHead, setIndexedHead] = useState(null);
  const [sourceHead, setSourceHead] = useState(null);

  // Demo/offline simulation state
  const demoRef = useRef({
    startedAt: Date.now(),
    phase: 0,
    baseSource: 12_755_323,
    baseIndexed: 12_755_124,
    lastTick: 0,
  });

  // failure/cooldown bookkeeping via refs (won't retrigger effects)
  const failCountRef = useRef(0);
  const coolingUntilRef = useRef(0);
  const inFlight = useRef({ health: false, sync: false });
  const loopTimerRef = useRef(null);
  const acRef = useRef(null);

  const canPoll = useCallback(() => {
    if (!authFetch && !OFFLINE) return false;
    if (document.hidden) return false;
    // Pause on heavy pages
    if (location.pathname.startsWith("/dashboard")) return false;
    // Respect circuit breaker cool-down
    if (Date.now() < coolingUntilRef.current) return false;
    return true;
  }, [authFetch, location.pathname]);

  const computeBackoff = () => {
    // 10s * 2^fail, capped @ 5 min
    const fc = Math.min(failCountRef.current, 10);
    return Math.min(300_000, 10_000 * 2 ** fc);
  };

  const bumpFailure = () => {
    const prev = failCountRef.current;
    const next = Math.min(prev + 1, 10);
    failCountRef.current = next;

    // circuit breaker: after 3 consecutive failures, cool down
    if (next >= 3) {
      const pause = computeBackoff(); // reuse same schedule
      coolingUntilRef.current = Date.now() + pause;
    }
  };

  const resetFailure = () => {
    failCountRef.current = 0;
    coolingUntilRef.current = 0;
  };

  const demoTick = useCallback(() => {
    const d = demoRef.current;
    const now = Date.now();
    const elapsed = now - d.startedAt;

    // Phases:
    // 0: Checking (0–2s)  => healthOnline=null, no blocks
    // 1: Offline  (2–5s)  => healthOnline=false, no blocks
    // 2: Syncing  (5–18s) => healthOnline=true, app lags then catches up
    // 3: Synced   (18–26s)=> healthOnline=true, app within 0–3 blocks
    // Loop every 26s
    const loopMs = 26_000;
    const t = elapsed % loopMs;

    let phase = 0;
    if (t >= 2_000 && t < 5_000) phase = 1;
    else if (t >= 5_000 && t < 18_000) phase = 2;
    else if (t >= 18_000) phase = 3;

    d.phase = phase;

    if (phase === 0) {
      setHealthOnline(null);
      setIndexedHead(null);
      setSourceHead(null);
      return;
    }

    if (phase === 1) {
      setHealthOnline(false);
      setIndexedHead(null);
      setSourceHead(null);
      return;
    }

    // Online phases
    setHealthOnline(true);

    // Advance chain slowly over time seeing "live" movement
    // (~1 block/sec equivalent for demo)
    const chainAdvance = Math.floor((elapsed - 5_000) / 1_000);
    const chain = d.baseSource + Math.max(0, chainAdvance);

    let appIndex;
    if (phase === 2) {
      // Start behind and catch up
      // lag shrinks from ~900 to ~30 blocks during syncing window
      const syncingProgress = (t - 5_000) / (18_000 - 5_000); // 0..1
      const lag = Math.round(900 - syncingProgress * 870); // 900 -> 30
      appIndex = chain - Math.max(0, lag);
    } else {
      // Synced: keep within 0..3 blocks
      const wobble = Math.floor(now / 900) % 4; // 0..3
      appIndex = chain - wobble;
    }

    setSourceHead(chain);
    setIndexedHead(appIndex);
  }, []);

  const checkHealth = useCallback(
    async (signal) => {
      if (OFFLINE) {
        // Demo mode controls health state
        demoTick();
        return;
      }
      if (inFlight.current.health) return;
      inFlight.current.health = true;
      try {
        const res = await authFetch("/api/v1/nl/health", { signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        setHealthOnline(data?.status === "healthy");
        resetFailure();
      } catch {
        setHealthOnline(false);
        bumpFailure();
      } finally {
        inFlight.current.health = false;
      }
    },
    [authFetch, demoTick],
  );

  const fetchSyncInfo = useCallback(
    async (signal) => {
      if (OFFLINE) {
        // Demo mode controls block values as well
        demoTick();
        return;
      }

      if (inFlight.current.sync) return;
      inFlight.current.sync = true;

      try {
        // backend endpoint runs SPARQL server-side
        const res = await authFetch("/api/v1/query/sync_data", { signal });

        if (!res.ok) throw new Error(String(res.status));

        const data = await res.json();

        // Be tolerant to multiple backend shapes:
        // - QueryResponse(results=<sparql json>)
        // - older wrappers that nest results multiple times
        const bindings =
          data?.results?.results?.bindings ||
          data?.results?.results?.results?.bindings ||
          data?.results?.results?.results?.results?.bindings ||
          data?.results?.bindings;

        const row = bindings?.[0];

        if (row) {
          const indexed = Number(row?.capBlockNum?.value ?? NaN);
          const source = Number(row?.currentCardanoHeight?.value ?? NaN);

          if (!Number.isNaN(indexed)) setIndexedHead(indexed);
          if (!Number.isNaN(source)) setSourceHead(source);
          resetFailure();
        } else {
          console.debug("Sync info: no bindings in sync_data response", data);
          bumpFailure();
        }
      } catch (e) {
        // Silence expected 500s during local dev
        if (e.message !== "500") {
          console.debug("Sync info failed:", e.message);
        }
        bumpFailure();
      } finally {
        inFlight.current.sync = false;
      }
    },
    [authFetch, demoTick],
  );

  const syncPct = useMemo(() => {
    if (indexedHead == null || sourceHead == null) return null;

    const chain = Math.max(1, sourceHead);
    const raw = (indexedHead / chain) * 100;
    const lag = Math.max(0, chain - indexedHead);

    // Show 100% when we're under the threshold
    if (lag <= 50) return 100;

    // Clamp
    const clamped = Math.max(0, Math.min(100, raw));

    // Keep one decimal place, but avoid rounding up to 100.0 unless it's truly 100
    if (clamped >= 100) return 100;

    return Math.floor(clamped * 10) / 10; // 99.99 -> 99.9
  }, [indexedHead, sourceHead]);

  const syncLag = useMemo(() => {
    if (indexedHead == null || sourceHead == null) return null;
    return Math.max(0, sourceHead - indexedHead);
  }, [indexedHead, sourceHead]);

  // Machine-readable status object (no UI strings)
  const syncStatus = useMemo(() => {
    // If health is explicitly offline, treat as offline even if blocks exist
    if (healthOnline === false) {
      return { code: SYNC_STATUS.OFFLINE, cls: "" };
    }

    // Unknown: nothing known yet
    if (indexedHead == null && sourceHead == null) {
      return { code: SYNC_STATUS.UNKNOWN, cls: "" };
    }

    // Checking: one side still missing
    if (indexedHead == null || sourceHead == null) {
      return { code: SYNC_STATUS.CHECKING, cls: "" };
    }

    // Synced vs syncing
    if (sourceHead - indexedHead <= 5) {
      return { code: SYNC_STATUS.SYNCED, cls: "synced" };
    }

    return { code: SYNC_STATUS.SYNCING, cls: "syncing" };
  }, [healthOnline, indexedHead, sourceHead]);

  // Stable loop: no dependency on backoff/failCount
  useEffect(() => {
    if (!authFetch) return;

    const singleton = getSingleton();
    if (singleton.running) {
      // Another instance already polling; just subscribe to state via returns of this hook
      return;
    }
    singleton.running = true;

    acRef.current = new AbortController();

    const loop = async () => {
      // If cooling or page hidden, schedule next check later
      if (!canPoll()) {
        loopTimerRef.current = setTimeout(loop, 10_000);
        return;
      }

      await checkHealth(acRef.current.signal);
      await fetchSyncInfo(acRef.current.signal);

      const delay = OFFLINE
        ? 2500
        : Math.max(
            5_000, // minimum 5s when healthy
            computeBackoff(),
          );
      loopTimerRef.current = setTimeout(loop, delay);
    };

    loop();

    return () => {
      singleton.running = false;
      if (acRef.current) acRef.current.abort();
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [authFetch, canPoll, checkHealth, fetchSyncInfo]);

  const refreshAll = useCallback(() => {
    const ac = new AbortController();
    checkHealth(ac.signal);
    fetchSyncInfo(ac.signal);
  }, [checkHealth, fetchSyncInfo]);

  return {
    healthOnline,
    indexedHead,
    sourceHead,
    syncStatus, // { code, cls }
    syncPct,
    syncLag,
    refreshAll,
    SYNC_STATUS,
  };
}
