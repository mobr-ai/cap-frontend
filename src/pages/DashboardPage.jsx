// src/pages/DashboardPage.jsx
import React, { useMemo, useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";

import Modal from "react-bootstrap/Modal";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { useDashboardItems } from "@/hooks/useDashboardItems";

import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { DashboardWidgetContent } from "@/components/dashboard/DashboardWidget";

import { useTranslation } from "react-i18next";

import "@/styles/DashboardPage.css";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { session, showToast, setLoading, loading } = useOutletContext() || {};
  const { authFetch } = useAuthRequest({ session, showToast });

  const [expandedItem, setExpandedItem] = useState(null);

  const handleExpandItem = (item) => {
    setExpandedItem(item);
  };

  const handleCloseModal = () => {
    setExpandedItem(null);
  };

  // Base data: dashboards list + default dashboard items
  const {
    dashboard: dashboardsRaw,
    defaultId,
    items: defaultItemsRaw,
    error,
    refresh,
  } = useDashboardData(authFetch);

  // --- Optional: simple loading hook based on data presence ---
  useEffect(() => {
    if ((!dashboardsRaw || !dashboardsRaw?.length) && !error) {
      setLoading && setLoading(true);
    } else {
      setLoading && setLoading(false);
    }
  }, [dashboardsRaw, error, setLoading]);

  const dashboards = useMemo(
    () => (Array.isArray(dashboardsRaw) ? dashboardsRaw : []),
    [dashboardsRaw]
  );

  // These are always the items for the default dashboard (from the hook)
  const defaultItems = useMemo(
    () => (Array.isArray(defaultItemsRaw) ? defaultItemsRaw : []),
    [defaultItemsRaw]
  );

  // View-level state: which dashboard is active and which items to show
  const { activeId, setActiveId, items, activeName } = useDashboardItems({
    dashboards,
    defaultId,
    defaultItems,
    authFetch,
  });

  const handleDeleteItem = async (id) => {
    if (!authFetch) return;

    try {
      const res = await authFetch(`/api/v1/dashboard/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();

      // Let backend be the source of truth; refresh will trigger
      // useDashboardData/useDashboardItems to refetch/poll as needed.
      if (typeof refresh === "function") {
        refresh();
      }
    } catch {
      if (typeof showToast === "function") {
        showToast("Unable to remove widget", "danger");
      }
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

        {!loading && !dashboards.length && !error && (
          <p>{t("dashboard.emptyPrompt")}</p>
        )}

        {error && (
          <p className="text-danger small mb-2">
            There was a problem loading dashboards or widgets. The view may be
            stale until it reconnects.
          </p>
        )}

        <DashboardGrid
          items={items}
          activeId={activeId}
          hasDashboards={dashboards.length > 0}
          onDelete={handleDeleteItem}
          onExpand={handleExpandItem}
          isLoading={loading}
        />

        {/* Expanded widget modal */}
        <Modal
          show={!!expandedItem}
          onHide={handleCloseModal}
          size="xl"
          centered
          animation
          dialogClassName="dashboard-widget-modal"
        >
          {expandedItem && (
            <>
              <Modal.Header closeButton>
                <Modal.Title>{expandedItem.title}</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                <div className="dashboard-widget-modal-inner">
                  <DashboardWidgetContent item={expandedItem} />
                </div>
              </Modal.Body>
            </>
          )}
        </Modal>
      </div>
    </div>
  );
}
