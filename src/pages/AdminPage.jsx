// src/pages/AdminPage.jsx
import React, { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthRequest } from "@/hooks/useAuthRequest";

import { useAdminSystemMetrics } from "@/hooks/useAdminSystemMetrics";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { useAdminWaitlist } from "@/hooks/useAdminWaitlist";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useAdminMetrics } from "@/hooks/useAdminMetrics";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { SystemOverview } from "@/components/admin/SystemOverview";
import { SystemDetails } from "@/components/admin/SystemDetails";
import { WaitlistStatsSummary } from "@/components/admin/WaitlistStatsSummary";
import { UserStatsSummary } from "@/components/admin/UserStatsSummary";
import { UserDirectory } from "@/components/admin/UserDirectory";
import { WaitlistDirectory } from "@/components/admin/WaitlistDirectory";
import { NewUserAlertsPanel } from "@/components/admin/NewUserAlertsPanel";
import { WaitlistAlertsPanel } from "@/components/admin/WaitlistAlertsPanel";
import { MetricsOverview } from "@/components/admin/MetricsOverview";

import "@/styles/AdminPage.css";

export default function AdminPage() {
  const { session, showToast } = useOutletContext() || {};
  const { t } = useTranslation();
  const { authFetch } = useAuthRequest({ session, showToast });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    { key: "overview" },
    { key: "users" },
    { key: "metrics" },
    { key: "system" },
    { key: "alerts" },
  ];

  //Sync tab → URL
  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const swipeHandlers = useSwipeTabs({
    activeTab,
    tabs,
    onChange: changeTab,
    swipeMinPx: 80, // feels better for full-page gestures
  });

  const system = useAdminSystemMetrics(authFetch);
  const users = useAdminUsers(authFetch, showToast, t);
  const waitlist = useAdminWaitlist(authFetch, showToast, t);
  const notifications = useAdminNotifications(authFetch, showToast, t);
  const metrics = useAdminMetrics(authFetch, activeTab === "metrics");

  // Guard (backend still enforces admin)
  if (!session || !session.is_admin) {
    return (
      <div className="AdminPage container">
        <div className="AdminPage-inner">
          <h1 className="admin-title">{t("admin.accessDeniedTitle")}</h1>
          <p className="admin-subtitle">{t("admin.accessDeniedText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="AdminPage container" {...swipeHandlers}>
      <div className="AdminPage-inner">
        <header className="admin-header">
          <h1 className="admin-title">{t("admin.title")}</h1>
          <p className="admin-subtitle">{t("admin.subtitle")}</p>
        </header>

        <AdminTabs activeTab={activeTab} onChange={changeTab} t={t} />

        {activeTab === "overview" && (
          <>
            <SystemOverview t={t} {...system} />
            <UserStatsSummary t={t} {...users} />
            <WaitlistStatsSummary t={t} {...waitlist} />
          </>
        )}

        {activeTab === "users" && (
          <>
            <UserStatsSummary t={t} {...users} />
            <WaitlistStatsSummary t={t} {...waitlist} />
            <div data-swipe-tabs-disabled="true">
              <UserDirectory t={t} showToast={showToast} {...users} />
              <WaitlistDirectory t={t} showToast={showToast} {...waitlist} />
            </div>
          </>
        )}

        {activeTab === "metrics" && (
          <>
            <MetricsOverview t={t} {...metrics} />
          </>
        )}

        {activeTab === "system" && <SystemDetails t={t} {...system} />}

        {activeTab === "alerts" && (
          <>
            <NewUserAlertsPanel t={t} {...notifications.newUser} />

            <WaitlistAlertsPanel t={t} {...notifications.waitlist} />
          </>
        )}
      </div>
    </div>
  );
}
