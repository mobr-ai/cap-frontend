// src/pages/DashboardPage.jsx
import React, { useMemo, useState, useLayoutEffect, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import Modal from "react-bootstrap/Modal";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { useDashboardItems } from "@/hooks/useDashboardItems";

import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { DashboardWidgetContent } from "@/components/dashboard/DashboardWidget";

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

  const dashboards = useMemo(
    () => (Array.isArray(dashboardsRaw) ? dashboardsRaw : []),
    [dashboardsRaw]
  );

  const hasDashboards = dashboards.length > 0;

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

  const isDashboardsLoading =
    (!dashboardsRaw || !dashboardsRaw?.length) && !error;

  // Widgets are "maybe loading" whenever:
  // - we already have dashboards
  // - BUT either we don't yet know the activeId
  //   or items haven't been populated (null/undefined).
  const isWidgetsMaybeLoading =
    hasDashboards &&
    (!activeId || items === null || typeof items === "undefined") &&
    !error;

  const isGridLoading = isDashboardsLoading || isWidgetsMaybeLoading;

  // Smooth out micro-flickers by debouncing "loading finished"
  const [debouncedGridLoading, setDebouncedGridLoading] = useState(true);

  useEffect(() => {
    if (isGridLoading) {
      // If something started loading again, show loader immediately
      setDebouncedGridLoading(true);
      return;
    }

    // When loading stops, wait a short delay before hiding the loader
    const timer = setTimeout(() => {
      setDebouncedGridLoading(false);
    }, 250); // tweak: 200–300ms usually feels good

    return () => clearTimeout(timer);
  }, [isGridLoading]);

  useLayoutEffect(() => {
    if (!setLoading) return;
    setLoading(debouncedGridLoading);
  }, [setLoading, debouncedGridLoading]);

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
          isLoading={isGridLoading}
        />

        {!debouncedGridLoading && !dashboards.length && !error && (
          <p>{t("dashboard.emptyPrompt")}</p>
        )}

        {error && (
          <p className="text-danger small mb-2">{t("dashboard.loadError")}</p>
        )}

        <DashboardGrid
          items={items}
          activeId={activeId}
          hasDashboards={dashboards.length > 0}
          onDelete={handleDeleteItem}
          onExpand={handleExpandItem}
          isLoading={debouncedGridLoading}
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
