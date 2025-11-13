// src/hooks/useSyncStatus.js
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

// Optional: set VITE_CAP_OFFLINE=true in .env.local to skip SPARQL during local dev
const OFFLINE = import.meta.env?.VITE_CAP_OFFLINE === "true";

// Dev/StrictMode singleton to avoid double loops
function getSingleton() {
  if (typeof window === "undefined") return { running: false };
  if (!window.__CAP_SYNC_SINGLETON__) {
    window.__CAP_SYNC_SINGLETON__ = { running: false };
  }
  return window.__CAP_SYNC_SINGLETON__;
}

/**
 * Health + sync polling with circuit breaker & backoff.
 */
export default function useSyncStatus(authFetch) {
  const location = useLocation();
  const [healthOnline, setHealthOnline] = useState(null);
  const [capBlock, setCapBlock] = useState(null);
  const [cardanoBlock, setCardanoBlock] = useState(null);

  // failure/cooldown bookkeeping via refs (won't retrigger effects)
  const failCountRef = useRef(0);
  const coolingUntilRef = useRef(0);
  const inFlight = useRef({ health: false, sync: false });
  const loopTimerRef = useRef(null);
  const acRef = useRef(null);

  const canPoll = useCallback(() => {
    if (!authFetch) return false;
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

  const checkHealth = useCallback(
    async (signal) => {
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
    [authFetch]
  );

  const fetchSyncInfo = useCallback(
    async (signal) => {
      if (OFFLINE) return; // skip entirely in local/offline runs

      if (inFlight.current.sync) return;
      inFlight.current.sync = true;
      try {
        const sparqlQuery = `
        PREFIX blockchain: <http://www.mobr.ai/ontologies/blockchain#>
        PREFIX cardano:   <http://www.mobr.ai/ontologies/cardano#>
        SELECT ?currentCardanoHeight (MAX(?blockNum) AS ?capBlockNum)
        WHERE {
          cardano:Cardano blockchain:hasCurrentBlockHeight ?currentCardanoHeight .
          ?block a blockchain:Block .
          ?block cardano:hasBlockNumber ?blockNum .
        }
        GROUP BY (?currentCardanoHeight)
      `;

        const res = await authFetch(VITE_NL_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: sparqlQuery, type: "SELECT" }),
          signal,
        });

        if (!res.ok) throw new Error(String(res.status));

        const data = await res.json();
        const row = data?.results?.results?.bindings?.[0];
        const cap = Number(row?.capBlockNum?.value ?? NaN);
        const chain = Number(row?.currentCardanoHeight?.value ?? NaN);
        if (!Number.isNaN(cap)) setCapBlock(cap);
        if (!Number.isNaN(chain)) setCardanoBlock(chain);
        resetFailure();
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
    [authFetch]
  );

  const syncStatus = useMemo(() => {
    if (capBlock == null && cardanoBlock == null)
      return { text: "Unknown", cls: "" };
    if (capBlock == null || cardanoBlock == null)
      return { text: "Checking...", cls: "" };
    if (cardanoBlock - capBlock <= 5) return { text: "Synced", cls: "synced" };
    const pct = Math.max(
      0,
      Math.min(100, Math.round((capBlock / Math.max(1, cardanoBlock)) * 100))
    );
    return { text: `Syncing (${pct}%)`, cls: "syncing" };
  }, [capBlock, cardanoBlock]);

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

      const delay = Math.max(
        5_000, // minimum 5s when healthy
        computeBackoff()
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

  return { healthOnline, capBlock, cardanoBlock, syncStatus, refreshAll };
}
