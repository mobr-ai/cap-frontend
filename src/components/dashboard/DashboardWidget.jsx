import React from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import VegaWidget from "./VegaWidget";
import KVTable from "./KVTable";

function renderItem(item) {
  const cfg = item.config || {};

  if (item.artifact_type === "chart" && cfg.vegaSpec) {
    return <VegaWidget spec={cfg.vegaSpec} />;
  }
  if (item.artifact_type === "table" && cfg.kv) {
    return <KVTable kv={cfg.kv} />;
  }

  return (
    <pre className="dashboard-json-fallback">
      {JSON.stringify(cfg, null, 2)}
    </pre>
  );
}

export default function DashboardWidget({ item, onDelete }) {
  return (
    <Card className="dashboard-widget">
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div>
          <div className="widget-title">{item.title}</div>
          {item.source_query && (
            <div className="widget-subtitle">From: {item.source_query}</div>
          )}
        </div>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => onDelete(item.id)}
        >
          Remove
        </Button>
      </Card.Header>
      <Card.Body>
        <div className="dashboard-widget-inner">{renderItem(item)}</div>
      </Card.Body>
    </Card>
  );
}
