// src/components/dashboard/DashboardGrid.jsx
import React from "react";
import { useTranslation } from "react-i18next";
import DashboardWidget from "@/components/dashboard/DashboardWidget";
import LoadingPage from "@/pages/LoadingPage";

export default function DashboardGrid({
  items,
  activeId,
  hasDashboards,
  onDelete,
  onExpand,
  isLoading,
}) {
  const { t } = useTranslation();

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

      {!isLoading &&
        items.map((item) => (
          <DashboardWidget
            key={item.id}
            item={item}
            onDelete={onDelete}
            onExpand={onExpand}
          />
        ))}

      {!isLoading && activeId && hasDashboards && items.length === 0 && (
        <p>{t("dashboard.noWidgetsYet")}</p>
      )}
    </div>
  );
}
