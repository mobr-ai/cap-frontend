// src/components/dashboard/DashboardGrid.jsx
import React from "react";
import DashboardWidget from "@/components/dashboard/DashboardWidget";

export default function DashboardGrid({
  items,
  activeId,
  hasDashboards,
  onDelete,
  onExpand,
}) {
  return (
    <div className="dashboard-grid">
      {items.map((item) => (
        <DashboardWidget
          key={item.id}
          item={item}
          onDelete={onDelete}
          onExpand={onExpand}
        />
      ))}

      {activeId && hasDashboards && items.length === 0 && (
        <p>No widgets pinned yet for this dashboard.</p>
      )}
    </div>
  );
}
