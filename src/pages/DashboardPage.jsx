// src/pages/DashboardPage.jsx
import React, {
  useMemo,
  useState,
  useLayoutEffect,
  useEffect,
  Suspense,
} from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";

import Modal from "react-bootstrap/Modal";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { useDashboardItems } from "@/hooks/useDashboardItems";

import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { DashboardWidgetContent } from "@/components/dashboard/DashboardWidget";

import LoadingPage from "@/pages/LoadingPage";

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

  // These are always the items for the default dashboard (from the hook)
  // IMPORTANT: keep null/undefined while loading so the hooks/loader can behave correctly.
  const defaultItems = useMemo(
    () => (Array.isArray(defaultItemsRaw) ? defaultItemsRaw : null),
    [defaultItemsRaw]
  );

  // View-level state: which dashboard is active and which items to show
  const { activeId, setActiveId, items, activeName } = useDashboardItems({
    dashboards,
    defaultId,
    defaultItems,
    authFetch,
  });

  const hasDashboards = dashboards.length > 0;
  const dashboardsLoaded =
    dashboardsRaw !== null && typeof dashboardsRaw !== "undefined";
  const isDashboardsLoading = !dashboardsLoaded && !error;
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

        <Suspense
          fallback={
            <LoadingPage
              type="ring" // "spin", "pulse", "orbit", "ring"
              fullscreen={true}
              message={t("loading.dashboardItems")}
            />
          }
        >
          <DashboardGrid
            items={items}
            activeId={activeId}
            hasDashboards={dashboards.length > 0}
            onDelete={handleDeleteItem}
            onExpand={handleExpandItem}
            isLoading={debouncedGridLoading}
          />
        </Suspense>

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
