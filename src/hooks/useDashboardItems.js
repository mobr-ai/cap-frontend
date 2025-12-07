import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPoller } from "@/utils/poller";
import { shallowEqualArray, setIfChanged } from "@/utils/arrays";

const DISABLE_DASH =
  String(import.meta.env.VITE_CAP_DISABLE_DASHBOARD_POLL ?? "false") === "true";

export function useDashboardItems({
  dashboards,
  defaultId,
  defaultItems,
  authFetch,
}) {
  const [activeId, setActiveId] = useState(null);
  const [items, setItems] = useState(null);

  const itemsPollerRef = useRef(null);
  const itemsAbortRef = useRef(null);

  const stopItemsPoller = useCallback(() => {
    if (itemsAbortRef.current) {
      itemsAbortRef.current.abort();
      itemsAbortRef.current = null;
    }
    if (itemsPollerRef.current?.unsub) {
      itemsPollerRef.current.unsub();
      itemsPollerRef.current = null;
    }
  }, []);

  // When we first know the defaultId, set it as active if nothing is selected
  useEffect(() => {
    if (activeId == null && defaultId != null) {
      setActiveId(defaultId);
    }
  }, [activeId, defaultId]);

  const startItemsPoller = useCallback(
    (dashId) => {
      if (DISABLE_DASH) return;
      stopItemsPoller();
      if (!dashId) return;

      const pollKey = `dashboard-items:${dashId}`;
      const poller = getPoller(pollKey, {
        interval: 25_000,
        maxInterval: 180_000,
      });

      poller.setFetcher(async () => {
        if (itemsAbortRef.current) itemsAbortRef.current.abort();
        itemsAbortRef.current = new AbortController();
        const res = await authFetch(`/api/v1/dashboard/${dashId}/items`, {
          signal: itemsAbortRef.current.signal,
        });
        if (!res.ok) throw new Error(`items ${res.status}`);
        return res.json();
      });

      const unsub = poller.subscribe((data, err) => {
        if (err) {
          console.warn("Items poll error:", err?.message || err);
          return;
        }
        const safe = Array.isArray(data) ? data : [];
        setIfChanged(setItems, safe, shallowEqualArray);
      });

      itemsPollerRef.current = { unsub };
    },
    [authFetch, stopItemsPoller]
  );

  // React to activeId changes
  useEffect(() => {
    if (!activeId) {
      // No active dashboard selected
      stopItemsPoller();
      setIfChanged(setItems, [], shallowEqualArray);
      return;
    }

    // If active is default dashboard, we never fetch/poll here.
    // We fully trust defaultItems from useDashboardData.
    if (defaultId && activeId === defaultId) {
      stopItemsPoller();

      if (defaultItems == null) {
        // default items still loading: keep items as "loading"
        setItems((prev) => (prev === null ? prev : null));
      } else {
        // default items loaded (possibly []): propagate to items
        setIfChanged(setItems, defaultItems, shallowEqualArray);
      }

      return;
    }

    // Non-default dashboard: mark items as "loading" before fetch/poll
    setItems(null);

    if (DISABLE_DASH) {
      // oneshot fetch
      if (!authFetch) return;

      if (itemsAbortRef.current) itemsAbortRef.current.abort();
      const ac = new AbortController();
      itemsAbortRef.current = ac;

      (async () => {
        try {
          const res = await authFetch(`/api/v1/dashboard/${activeId}/items`, {
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`items ${res.status}`);
          const data = await res.json();
          const safe = Array.isArray(data) ? data : [];
          setIfChanged(setItems, safe, shallowEqualArray);
        } catch (err) {
          if (err?.name === "AbortError") return;
          console.warn("Oneshot items fetch error:", err?.message || err);
          // Failed oneshot: treat as "loaded but empty" for now
          setIfChanged(setItems, [], shallowEqualArray);
        }
      })();

      return;
    }

    // polling mode for non-default dashboards
    startItemsPoller(activeId);
  }, [
    activeId,
    defaultId,
    defaultItems,
    authFetch,
    startItemsPoller,
    stopItemsPoller,
  ]);

  // If we are currently on the default dashboard, sync with any changes
  // coming from useDashboardData (both oneshot + polling modes).
  useEffect(() => {
    if (defaultId && activeId === defaultId) {
      if (defaultItems == null) {
        // still loading → keep items as null so the grid stays in "loading" mode
        setItems((prev) => (prev === null ? prev : null));
      } else {
        // loaded (could be [] if truly no widgets)
        setIfChanged(setItems, defaultItems, shallowEqualArray);
      }
    }
  }, [defaultItems, activeId, defaultId]);

  // Cleanup
  useEffect(
    () => () => {
      stopItemsPoller();
    },
    [stopItemsPoller]
  );

  const activeName = useMemo(() => {
    if (!activeId) return "Select dashboard";
    return (
      dashboards.find((d) => d.id === activeId)?.name || "Select dashboard"
    );
  }, [dashboards, activeId]);

  return {
    activeId,
    setActiveId,
    items,
    activeName,
  };
}
