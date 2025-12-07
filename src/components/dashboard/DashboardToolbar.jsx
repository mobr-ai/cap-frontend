// src/components/dashboard/DashboardToolbar.jsx
import React from "react";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";

export default function DashboardToolbar({
  dashboards,
  activeId,
  activeName,
  onSelectDashboard,
  onRefresh,
  isLoading,
}) {
  return (
    !isLoading && (
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
                onClick={() => onSelectDashboard(d.id)}
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
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </div>
    )
  );
}
