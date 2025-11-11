// src/pages/DashboardPage.jsx

import React, { useEffect, useState, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Dropdown from "react-bootstrap/Dropdown";
import "../styles/DashboardPage.css";

// Simple Vega container (same pattern as LandingPage)
function VegaWidget({ spec }) {
  const ref = React.useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!spec || !ref.current) return;

    let cancelled = false;
    let view = null;

    async function render() {
      try {
        const mod = await import("vega-embed");
        const embed = mod.default || mod;
        if (cancelled) return;
        const result = await embed(ref.current, spec, { actions: false });
        view = result.view;
      } catch (e) {
        if (!cancelled) setError("Unable to render chart.");
      }
    }

    render();

    return () => {
      cancelled = true;
      if (view) {
        try {
          view.finalize();
        } catch {
          //
        }
      }
    };
  }, [spec]);

  if (error) {
    return <div className="vega-chart-error">{error}</div>;
  }

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

export default function DashboardPage() {
  const { session, showToast } = useOutletContext();
  const { useAuthRequest } = require("../hooks/useAuthRequest"); // to avoid circular import in text form
  const { authFetch } = useAuthRequest({ session, showToast });

  const [dashboards, setDashboards] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [items, setItems] = useState([]);

  const loadDashboards = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/dashboard", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load dashboards");
      const data = await res.json();
      setDashboards(data || []);
      const preferred = data.find((d) => d.is_default) || data[0] || null;
      setActiveId((prev) => prev || (preferred ? preferred.id : null));
    } catch (err) {
      console.error(err);
      showToast && showToast("Unable to load dashboards", "danger");
    }
  }, [authFetch, showToast]);

  const loadItems = useCallback(
    async (dashboardId) => {
      if (!dashboardId) {
        setItems([]);
        return;
      }
      try {
        const res = await authFetch(`/api/v1/dashboard/${dashboardId}/items`, {
          method: "GET",
        });
        if (!res.ok) throw new Error("Failed to load items");
        const data = await res.json();
        setItems(data || []);
      } catch (err) {
        console.error(err);
        showToast && showToast("Unable to load dashboard items", "danger");
      }
    },
    [authFetch, showToast]
  );

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  useEffect(() => {
    if (activeId) {
      loadItems(activeId);
    }
  }, [activeId, loadItems]);

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

    if (item.artifact_type === "chart" && cfg.vegaSpec) {
      return <VegaWidget spec={cfg.vegaSpec} />;
    }

    if (item.artifact_type === "table" && cfg.kv) {
      return <KVTable kv={cfg.kv} />;
    }

    // fallback: pretty-print JSON
    return (
      <pre className="dashboard-json-fallback">
        {JSON.stringify(cfg, null, 2)}
      </pre>
    );
  };

  return (
    <div className="cap-root">
      <div className="container py-4">
        <div className="d-flex align-items-center mb-3">
          <h2 className="me-3">Dashboard</h2>

          <Dropdown>
            <Dropdown.Toggle variant="secondary" size="sm">
              {activeId
                ? dashboards.find((d) => d.id === activeId)?.name ||
                  "Select dashboard"
                : "Select dashboard"}
            </Dropdown.Toggle>
            <Dropdown.Menu>
              {dashboards.map((d) => (
                <Dropdown.Item key={d.id} onClick={() => setActiveId(d.id)}>
                  {d.name}
                  {d.is_default ? " (default)" : ""}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </div>

        {!activeId && (
          <p>
            No dashboard yet. Pin any table or chart from the chat to create
            your default dashboard automatically.
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
              <Card.Body>{renderItem(item)}</Card.Body>
            </Card>
          ))}

          {activeId && items.length === 0 && (
            <p>No widgets pinned yet for this dashboard.</p>
          )}
        </div>
      </div>
    </div>
  );
}
