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

  // Normalize items
  const safeItems = Array.isArray(items) ? items : [];

  // Local loading guard: even if the parent says "not loading",
  // we still treat items === null/undefined as "still loading",
  // so we NEVER show the empty-state message during that phase.
  const isStillLoading =
    isLoading || items === null || typeof items === "undefined";

  // While still loading, let the Layout/parent render LoadingPage.
  if (isStillLoading) {
    return null;
  }

  const showEmptyState = activeId && hasDashboards && safeItems.length === 0;

  return (
    <div className="dashboard-grid">
      {safeItems.map((item) => (
        <DashboardWidget
          key={item.id}
          item={item}
          onDelete={onDelete}
          onExpand={onExpand}
        />
      ))}

      {showEmptyState && <p>{t("dashboard.noWidgetsYet")}</p>}
    </div>
  );
}
