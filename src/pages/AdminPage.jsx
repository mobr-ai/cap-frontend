// src/pages/AdminPage.jsx
import React, { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthRequest } from "@/hooks/useAuthRequest";

import { useAdminSystemMetrics } from "@/hooks/useAdminSystemMetrics";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { SystemOverview } from "@/components/admin/SystemOverview";
import { SystemDetails } from "@/components/admin/SystemDetails";
import { UserStatsSummary } from "@/components/admin/UserStatsSummary";
import { UserDirectory } from "@/components/admin/UserDirectory";
import { NewUserAlertsPanel } from "@/components/admin/NewUserAlertsPanel";

import "@/styles/AdminPage.css";

export default function AdminPage() {
  const { session, showToast } = useOutletContext() || {};
  const { t } = useTranslation();
  const { authFetch } = useAuthRequest({ session, showToast });

  const [activeTab, setActiveTab] = useState("overview");

  const system = useAdminSystemMetrics(authFetch);
  const users = useAdminUsers(authFetch, showToast, t);
  const notifications = useAdminNotifications(authFetch, showToast, t);

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
    <div className="AdminPage container">
      <div className="AdminPage-inner">
        <header className="admin-header">
          <h1 className="admin-title">{t("admin.title")}</h1>
          <p className="admin-subtitle">{t("admin.subtitle")}</p>
        </header>

        <AdminTabs activeTab={activeTab} onChange={setActiveTab} t={t} />

        {activeTab === "overview" && (
          <>
            <SystemOverview t={t} {...system} />
            <UserStatsSummary t={t} {...users} />
          </>
        )}

        {activeTab === "users" && (
          <>
            <UserStatsSummary t={t} {...users} />
            <UserDirectory t={t} showToast={showToast} {...users} />
          </>
        )}

        {activeTab === "system" && <SystemDetails t={t} {...system} />}

        {activeTab === "alerts" && (
          <NewUserAlertsPanel t={t} {...notifications} />
        )}
      </div>
    </div>
  );
}
