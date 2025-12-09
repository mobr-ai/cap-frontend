// src/components/dashboard/DashboardWidget.jsx
import React from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";

import VegaChart from "@/components/artifacts/VegaChart";
import KVTable, { isValidKVTable } from "@/components/artifacts/KVTable";

export function DashboardWidgetContent({ item }) {
  const cfg = item.config || {};

  if (item.artifact_type === "chart" && cfg.vegaSpec) {
    return <VegaChart spec={cfg.vegaSpec} />;
  }

  if (item.artifact_type === "table") {
    if (cfg.kv && isValidKVTable(cfg.kv)) {
      // sortable by default, same UX as chat
      return <KVTable kv={cfg.kv} />;
    }

    // Table artifact exists but content is invalid/empty – show a small note
    // instead of an empty table so the user can still remove the widget.
    return (
      <div className="dashboard-json-fallback">
        This table result is empty or invalid and cannot be displayed.
      </div>
    );
  }

  // Fallback for legacy items / debugging
  return (
    <pre className="dashboard-json-fallback">
      {JSON.stringify(cfg, null, 2)}
    </pre>
  );
}

export default function DashboardWidget({ item, onDelete, onExpand }) {
  const cfg = item.config || {};
  const isTable = item.artifact_type === "table";
  const columns = (cfg.kv?.metadata?.columns || []).filter(Boolean);

  // Same wide-card heuristic as before (can tweak later)
  const isWide = cfg.layout === "wide" || (isTable && columns.length >= 6);

  const handleCardClick = () => {
    if (onExpand) onExpand(item);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation(); // don’t trigger expand
    onDelete?.(item.id);
  };

  const cardClassName = [
    "dashboard-widget",
    isWide && "widget-wide",
    onExpand && "dashboard-widget-clickable",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Card className={cardClassName} onClick={handleCardClick}>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <div className="widget-title">{item.title}</div>
          {item.source_query && (
            <div className="widget-subtitle">From: {item.source_query}</div>
          )}
        </div>
        <Button variant="outline-danger" size="sm" onClick={handleDeleteClick}>
          Remove
        </Button>
      </Card.Header>

      <Card.Body>
        <div className="dashboard-widget-inner">
          <DashboardWidgetContent item={item} />
        </div>
      </Card.Body>
    </Card>
  );
}
