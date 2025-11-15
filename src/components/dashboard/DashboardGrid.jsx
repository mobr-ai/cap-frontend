import React from "react";
import DashboardWidget from "./DashboardWidget";

export default function DashboardGrid({
  items,
  activeId,
  hasDashboards,
  onDelete,
}) {
  return (
    <div className="dashboard-grid">
      {items.map((item) => (
        <DashboardWidget key={item.id} item={item} onDelete={onDelete} />
      ))}

      {activeId && hasDashboards && items.length === 0 && (
        <p>No widgets pinned yet for this dashboard.</p>
      )}
    </div>
  );
}
