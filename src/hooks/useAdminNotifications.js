// src/hooks/useAdminNotifications.js
import { useEffect, useState } from "react";

export function useAdminNotifications(authFetch, showToast, t) {
  const [notifyConfig, setNotifyConfig] = useState({
    enabled: false,
    recipients: [],
  });
  const [notifyRecipientsText, setNotifyRecipientsText] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyError, setNotifyError] = useState(null);
  const [notificationsTesting, setNotificationsTesting] = useState(false);

  const authReady = !!authFetch;

  // load config once when auth is ready
  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function loadNotifyConfig() {
      setNotifyLoading(true);
      setNotifyError(null);
      try {
        const response = await authFetch(
          "/api/v1/admin/notifications/new_user",
          { method: "GET" }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const recipients = Array.isArray(data.recipients)
          ? data.recipients
          : [];

        setNotifyConfig({
          enabled: !!data.enabled,
          recipients,
        });
        setNotifyRecipientsText(recipients.join("\n"));
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setNotifyError(err.message || "Failed to load notification config");
        }
      } finally {
        if (!cancelled) setNotifyLoading(false);
      }
    }

    loadNotifyConfig();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  const setNotifyEnabled = (enabled) =>
    setNotifyConfig((prev) => ({ ...prev, enabled }));

  const setNotifyText = (raw) => {
    setNotifyRecipientsText(raw);
    const recipients = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    setNotifyConfig((prev) => ({ ...prev, recipients }));
  };

  const saveNotify = async () => {
    setNotifySaving(true);
    setNotifyError(null);
    try {
      const response = await authFetch("/api/v1/admin/notifications/new_user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notifyConfig),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];

      setNotifyConfig({
        enabled: !!data.enabled,
        recipients,
      });
      setNotifyRecipientsText(recipients.join("\n"));

      showToast && showToast(t("admin.notifySaveSuccess"), "success");
    } catch (err) {
      console.error(err);
      setNotifyError(err.message || "Failed to save notification config");
      showToast && showToast(t("admin.notifySaveError"), "danger");
    } finally {
      setNotifySaving(false);
    }
  };

  const testNotify = async () => {
    if (!authFetch) return;

    try {
      setNotificationsTesting(true);

      const res = await authFetch("/api/v1/admin/notifications/test", {
        method: "POST",
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        // ignore
      }

      if (!res.ok) {
        const msg = data?.detail || t("admin.notificationsTestError");
        showToast && showToast(msg, "danger");
        return;
      }

      showToast && showToast(t("admin.notificationsTestOk"), "success");
    } catch (err) {
      console.error(err);
      showToast && showToast(t("admin.notificationsTestError"), "danger");
    } finally {
      setNotificationsTesting(false);
    }
  };

  return {
    notifyConfig,
    notifyRecipientsText,
    notifyLoading,
    notifySaving,
    notifyError,
    notificationsTesting,
    setNotifyEnabled,
    setNotifyText,
    saveNotify,
    testNotify,
  };
}
