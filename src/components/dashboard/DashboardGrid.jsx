// src/components/dashboard/DashboardGrid.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import DashboardWidget from "@/components/dashboard/DashboardWidget";

export default function DashboardGrid({
  items,
  activeId,
  hasDashboards,
  onDelete,
  onExpand,
  isLoading,
}) {
  const { t } = useTranslation();
  const safeItems = Array.isArray(items) ? items : [];

  return (
    !isLoading && (
      <div className="dashboard-grid">
        {safeItems.map((item) => (
          <DashboardWidget
            key={item.id}
            item={item}
            onDelete={onDelete}
            onExpand={onExpand}
          />
        ))}

        {!isLoading && activeId && hasDashboards && safeItems.length === 0 && (
          <p>{t("dashboard.noWidgetsYet")}</p>
        )}
      </div>
    )
  );
}
