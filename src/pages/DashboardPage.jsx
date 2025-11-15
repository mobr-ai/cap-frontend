// src/pages/DashboardPage.jsx
import React from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { useDashboardItems } from "@/hooks/useDashboardItems";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import "@/styles/DashboardPage.css";

export default function DashboardPage() {
  const { session, showToast } = useOutletContext();
  const { authFetch } = useAuthRequest({ session, showToast });

  const {
    dashboard: dashboardsRaw,
    defaultId,
    items: defaultItemsRaw,
    error,
    refresh,
  } = useDashboardData(authFetch);

  const dashboards = React.useMemo(
    () => (Array.isArray(dashboardsRaw) ? dashboardsRaw : []),
    [dashboardsRaw]
  );
  const defaultItems = React.useMemo(
    () => (Array.isArray(defaultItemsRaw) ? defaultItemsRaw : []),
    [defaultItemsRaw]
  );

  const { activeId, setActiveId, items, activeName } = useDashboardItems({
    dashboards,
    defaultId,
    defaultItems,
    authFetch,
  });

  const handleDeleteItem = async (id) => {
    try {
      const res = await authFetch(`/api/v1/dashboard/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      // easiest: rely on the backend as source of truth
      // and let useDashboardData/useDashboardItems pick it up via refresh.
      refresh && refresh();
    } catch {
      showToast && showToast("Unable to remove widget", "danger");
    }
  };

  return (
    <div className="cap-root">
      <div className="container py-4">
        <DashboardToolbar
          dashboards={dashboards}
          activeId={activeId}
          activeName={activeName}
          onSelectDashboard={setActiveId}
          onRefresh={refresh}
        />

        {!dashboards.length && (
          <p>
            Pin any table or chart from the chat to create your dashboard
            automatically.
          </p>
        )}

        <DashboardGrid
          items={items}
          activeId={activeId}
          hasDashboards={dashboards.length > 0}
          onDelete={handleDeleteItem}
        />
      </div>
    </div>
  );
}
