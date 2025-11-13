// src/hooks/useDashboardData.js
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getPoller } from "@/utils/poller";

// small helpers to avoid useless re-renders
function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    if (x?.id != null || y?.id != null) {
      if (x?.id !== y?.id) return false;
    } else if (x !== y) {
      return false;
    }
  }
  return true;
}
const setIfChanged = (set, next, eq) =>
  set((prev) => (eq(prev, next) ? prev : next));

export default function useDashboardData(authFetch) {
  const DISABLE_DASH =
    String(import.meta.env.VITE_CAP_DISABLE_DASHBOARD_POLL ?? "false") ===
    "true";

  const [dashboard, setDashboard] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  const acDashRef = useRef(null);
  const acItemsRef = useRef(null);

  // one poller for list, one per default-id for items
  const pollDash = useMemo(
    () => getPoller("dashboards", { interval: 30_000, maxInterval: 300_000 }),
    []
  );
  // NOTE: items poller key includes the id so we swap cleanly when id changes
  const getItemsPoller = useCallback(
    (id) =>
      getPoller(`dashboard-items:${id}`, {
        interval: 25_000,
        maxInterval: 180_000,
      }),
    []
  );
  const itemsPollerRef = useRef(null);

  // -------- poll dashboards list ----------
  useEffect(() => {
    if (!authFetch) return;

    pollDash.setFetcher(async () => {
      if (acDashRef.current) acDashRef.current.abort();
      acDashRef.current = new AbortController();
      const res = await authFetch("/api/v1/dashboard", {
        signal: acDashRef.current.signal,
      });
      if (!res.ok) throw new Error(`dashboards ${res.status}`);
      return res.json();
    });

    const unsub = pollDash.subscribe((data, err) => {
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      const list = Array.isArray(data) ? data : [];
      setIfChanged(setDashboard, list, shallowEqualArray);

      // choose default once we have data
      const preferred = list.find((d) => d.is_default) || list[0] || null;
      const nextId = preferred?.id ?? null;
      setDefaultId((prev) => (prev == null ? nextId : prev));
    });

    return () => {
      if (acDashRef.current) acDashRef.current.abort();
      unsub();
    };
  }, [authFetch, pollDash]);

  // -------- poll items for the default dashboard ----------
  useEffect(() => {
    // stop when disabled, unauth, or we don't know the id yet
    if (DISABLE_DASH || !authFetch || !defaultId) return () => {};

    // cancel previous
    if (acItemsRef.current) acItemsRef.current.abort();
    if (itemsPollerRef.current?.unsub) {
      itemsPollerRef.current.unsub();
      itemsPollerRef.current = null;
    }

    const poller = getItemsPoller(defaultId);

    poller.setFetcher(async () => {
      if (acItemsRef.current) acItemsRef.current.abort();
      acItemsRef.current = new AbortController();
      // ✅ include the id here
      const res = await authFetch(`/api/v1/dashboard/${defaultId}/items`, {
        signal: acItemsRef.current.signal,
      });
      if (!res.ok) throw new Error(`items ${res.status}`);
      return res.json();
    });

    const unsub = poller.subscribe((data, err) => {
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      const list = Array.isArray(data) ? data : [];
      setIfChanged(setItems, list, shallowEqualArray);
    });

    itemsPollerRef.current = { unsub };

    return () => {
      if (acItemsRef.current) acItemsRef.current.abort();
      unsub();
    };
  }, [DISABLE_DASH, authFetch, defaultId, getItemsPoller]);

  // expose manual refresh
  const refresh = useCallback(() => {
    pollDash.forceRefresh();
    if (defaultId) getItemsPoller(defaultId).forceRefresh();
  }, [pollDash, defaultId, getItemsPoller]);

  return { dashboard, items, error, refresh };
}
