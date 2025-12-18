import React from "react";

export function WaitlistAlertsPanel({
  t,
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
}) {
  const handleToggle = (e) => {
    setNotifyEnabled(e.target.checked);
  };

  const handleChangeText = (e) => {
    setNotifyText(e.target.value);
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          {t("admin.waitlistNotifySectionTitle")}
        </h2>
        <p className="admin-section-subtitle">
          {t("admin.waitlistNotifySectionSubtitle")}
        </p>
      </div>

      <div className="admin-notify-card">
        <div className="admin-notify-row">
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="adminWaitlistNotifyEnabled"
              checked={notifyConfig.enabled}
              onChange={handleToggle}
              disabled={notifyLoading || notifySaving}
            />
            <label
              className="form-check-label"
              htmlFor="adminWaitlistNotifyEnabled"
            >
              {t("admin.waitlistNotifyToggleLabel")}
            </label>
          </div>
        </div>

        <div className="admin-notify-row admin-notify-row--textarea">
          <label htmlFor="adminWaitlistNotifyRecipients" className="form-label">
            {t("admin.notifyRecipientsLabel")}
          </label>
          <textarea
            id="adminWaitlistNotifyRecipients"
            className="form-control admin-notify-textarea"
            rows={3}
            placeholder={t("admin.notifyRecipientsPlaceholder")}
            value={notifyRecipientsText}
            onChange={handleChangeText}
            disabled={notifyLoading || notifySaving}
          />
          <small>{t("admin.waitlistNotifyRecipientsHelp")}</small>
        </div>

        {notifyError && (
          <p className="admin-status-text admin-status-text--error mt-2">
            {notifyError}
          </p>
        )}

        <div className="admin-notify-footer">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={testNotify}
            disabled={notifyLoading || notifySaving || notificationsTesting}
          >
            {notificationsTesting
              ? t("admin.notificationsTesting")
              : t("admin.notificationsSendTest")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={saveNotify}
            disabled={notifyLoading || notifySaving}
          >
            {notifySaving
              ? t("admin.notifySaving")
              : t("admin.notifySaveButton")}
          </button>
        </div>
      </div>
    </section>
  );
}
