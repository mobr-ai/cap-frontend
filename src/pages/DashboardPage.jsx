// src/pages/DashboardPage.jsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { getPoller } from "@/utils/poller";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import "@/styles/DashboardPage.css";

/* ---------------- utils ---------------- */

function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    // compare by id if present, else strict ref equality
    if (x?.id != null || y?.id != null) {
      if (x?.id !== y?.id) return false;
    } else if (x !== y) {
      return false;
    }
  }
  return true;
}

function setIfChanged(setter, next, eq) {
  setter((prev) => (eq(prev, next) ? prev : next));
}

/* ---------------- renderers ---------------- */

function VegaWidget({ spec }) {
  const ref = React.useRef(null);
  const [error, setError] = React.useState(null);

  const normalizeSpec = (s) => {
    if (!s) return s;
    const copy =
      typeof structuredClone === "function"
        ? structuredClone(s)
        : JSON.parse(JSON.stringify(s));
    if (typeof copy.$schema === "string") {
      copy.$schema = copy.$schema
        .replace("vega-lite/v4.json", "vega-lite/v6.json")
        .replace("vega-lite/v5.json", "vega-lite/v6.json");
    }

    // Let Vega-Lite resize with the container
    copy.autosize = {
      type: "fit",
      contains: "padding",
      resize: true,
      ...(copy.autosize || {}),
    };

    return copy;
  };

  React.useEffect(() => {
    if (!spec || !ref.current) return;

    let cancelled = false;
    let view = null;

    (async () => {
      try {
        const mod = await import("vega-embed");
        const embed = mod.default || mod;
        if (cancelled) return;
        const result = await embed(ref.current, normalizeSpec(spec), {
          actions: false,
          renderer: "canvas",
        });
        view = result.view;
      } catch (e) {
        console.error("Vega render error:", e);
        if (!cancelled) setError("Unable to render chart.");
      }
    })();

    return () => {
      cancelled = true;
      if (view)
        try {
          view.finalize();
        } catch {
          // ignore
        }
    };
  }, [spec]);

  if (error) return <div className="vega-chart-error">{error}</div>;
  return <div className="vega-chart-container" ref={ref} />;
}

function KVTable({ kv }) {
  const columns = kv?.metadata?.columns || [];
  const cols = kv?.data?.values || [];
  if (!columns.length || !cols.length) return null;

  const rows = [];
  const maxLen = Math.max(...cols.map((c) => (c.values || []).length));
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    for (let c = 0; c < cols.length; c++) {
      const key = columns[c] || Object.keys(cols[c])[0];
      row[key] = cols[c].values?.[i] ?? "";
    }
    rows.push(row);
  }

  return (
    <div className="kv-table-wrapper">
      <table className="kv-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{row[col]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- page ---------------- */

export default function DashboardPage() {
  const { session, showToast } = useOutletContext();
  const { authFetch } = useAuthRequest({ session, showToast });

  const DISABLE_DASH =
    String(import.meta.env.VITE_CAP_DISABLE_DASHBOARD_POLL ?? "false") ===
    "true";

  // From hook: dashboards list and "default dashboard items" (oneshot or poll)
  const {
    dashboard: dashboardsRaw,
    items: defaultItemsRaw,
    error,
    refresh,
  } = useDashboardData(authFetch);

  // Keep stable references (avoid re-computes on identical data)
  const dashboards = useMemo(
    () => (Array.isArray(dashboardsRaw) ? dashboardsRaw : []),
    [dashboardsRaw]
  );
  const defaultItems = useMemo(
    () => (Array.isArray(defaultItemsRaw) ? defaultItemsRaw : []),
    [defaultItemsRaw]
  );

  const [activeId, setActiveId] = useState(null);
  const [items, setItems] = useState([]);

  const defaultId = useMemo(() => {
    if (!dashboards.length) return null;
    const d = dashboards.find((x) => x.is_default) || dashboards[0];
    return d?.id ?? null;
  }, [dashboards]);

  // Set first / default dashboard only once when we finally have a list
  useEffect(() => {
    if (activeId == null && defaultId != null) {
      setActiveId(defaultId);
    }
  }, [activeId, defaultId]);

  // Per-dashboard polling infra (used only when polling is enabled)
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

  const startItemsPoller = useCallback(
    (dashId) => {
      // In oneshot mode, we do not start a continuous poller
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
    [DISABLE_DASH, authFetch, stopItemsPoller]
  );

  // React to activeId changes:
  // - In oneshot mode:
  //    * If active is default -> use defaultItems from hook
  //    * Else -> perform a single fetch for that dashboard's items
  // - In polling mode (original logic):
  //    * If active is default -> use defaultItems, stop extra poller
  //    * Else -> start (or switch) per-dashboard poller
  useEffect(() => {
    if (!activeId) {
      stopItemsPoller();
      setIfChanged(setItems, [], shallowEqualArray);
      return;
    }

    // --- oneshot mode: no continuous polling, just fetch once ---
    if (DISABLE_DASH) {
      // Ensure no leftover pollers are running
      stopItemsPoller();

      // Default dashboard: rely on hook's defaultItems
      if (defaultId && activeId === defaultId) {
        setIfChanged(setItems, defaultItems, shallowEqualArray);
        return;
      }

      // Non-default dashboard: fetch items once
      if (!authFetch) return;

      if (itemsAbortRef.current) {
        itemsAbortRef.current.abort();
      }
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
        }
      })();

      return;
    }

    // --- polling mode: original behaviour ---
    if (defaultId && activeId === defaultId) {
      // Use defaultItems and stop extra poller
      stopItemsPoller();
      setIfChanged(setItems, defaultItems, shallowEqualArray);
    } else {
      // Non-default dashboard -> per-dashboard poller
      startItemsPoller(activeId);
    }
  }, [
    DISABLE_DASH,
    activeId,
    defaultId,
    defaultItems,
    authFetch,
    startItemsPoller,
    stopItemsPoller,
  ]);

  // If we're on the default dashboard and the hook’s defaultItems changed,
  // reflect it (both in oneshot and polling mode), but only when truly different.
  useEffect(() => {
    if (defaultId && activeId === defaultId) {
      setIfChanged(setItems, defaultItems, shallowEqualArray);
    }
  }, [defaultItems, activeId, defaultId]);

  // Cleanup on unmount
  useEffect(() => () => stopItemsPoller(), [stopItemsPoller]);

  const handleDeleteItem = async (id) => {
    try {
      const res = await authFetch(`/api/v1/dashboard/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      showToast && showToast("Unable to remove widget", "danger");
    }
  };

  const renderItem = (item) => {
    const cfg = item.config || {};
    if (item.artifact_type === "chart" && cfg.vegaSpec)
      return <VegaWidget spec={cfg.vegaSpec} />;
    if (item.artifact_type === "table" && cfg.kv)
      return <KVTable kv={cfg.kv} />;
    return (
      <pre className="dashboard-json-fallback">
        {JSON.stringify(cfg, null, 2)}
      </pre>
    );
  };

  const activeName = useMemo(() => {
    if (!activeId) return "Select dashboard";
    return (
      dashboards.find((d) => d.id === activeId)?.name || "Select dashboard"
    );
  }, [dashboards, activeId]);

  return (
    <div className="cap-root">
      <div className="container py-4">
        <div className="d-flex align-items-center mb-3">
          <h2 className="me-3">Dashboard</h2>

          <Dropdown>
            <Dropdown.Toggle variant="secondary" size="sm">
              {activeName}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {dashboards.map((d) => (
                <Dropdown.Item
                  key={d.id}
                  active={d.id === activeId}
                  onClick={() => setActiveId(d.id)}
                >
                  {d.name}
                  {d.is_default ? " (default)" : ""}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>

          <Button
            className="ms-2"
            variant="outline-secondary"
            size="sm"
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>

        {!dashboards.length && (
          <p>
            Pin any table or chart from the chat to create your dashboard
            automatically.
          </p>
        )}

        <div className="dashboard-grid">
          {items.map((item) => (
            <Card key={item.id} className="dashboard-widget">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="widget-title">{item.title}</div>
                  {item.source_query && (
                    <div className="widget-subtitle">
                      From: {item.source_query}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeleteItem(item.id)}
                >
                  Remove
                </Button>
              </Card.Header>
              <Card.Body>
                <div className="dashboard-widget-inner">{renderItem(item)}</div>
              </Card.Body>
            </Card>
          ))}

          {activeId && dashboards.length && items.length === 0 && (
            <p>No widgets pinned yet for this dashboard.</p>
          )}
        </div>
      </div>
    </div>
  );
}
