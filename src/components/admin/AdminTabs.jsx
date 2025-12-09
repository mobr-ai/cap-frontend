// src/components/admin/AdminTabs.jsx
export function AdminTabs({ activeTab, onChange, t }) {
  return (
    <div className="admin-tabs">
      <button
        type="button"
        className={
          activeTab === "overview" ? "admin-tab admin-tab--active" : "admin-tab"
        }
        onClick={() => onChange("overview")}
      >
        {t("admin.tabOverview")}
      </button>

      <button
        type="button"
        className={
          activeTab === "users" ? "admin-tab admin-tab--active" : "admin-tab"
        }
        onClick={() => onChange("users")}
      >
        {t("admin.tabUsers")}
      </button>

      <button
        type="button"
        className={
          activeTab === "system" ? "admin-tab admin-tab--active" : "admin-tab"
        }
        onClick={() => onChange("system")}
      >
        {t("admin.tabSystem")}
      </button>

      <button
        type="button"
        className={
          activeTab === "alerts" ? "admin-tab admin-tab--active" : "admin-tab"
        }
        onClick={() => onChange("alerts")}
      >
        {t("admin.tabAlerts")}
      </button>
    </div>
  );
}
