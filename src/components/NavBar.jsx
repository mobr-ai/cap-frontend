import "./../styles/NavBar.css";
import React, { useMemo, useState } from "react";
import Container from "react-bootstrap/Container";
import Image from "react-bootstrap/Image";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import NavDropdown from "react-bootstrap/NavDropdown";
import { Link, useNavigate, useLocation } from "react-router-dom";
import i18n from "./../i18n";
import { useTranslation } from "react-i18next";

import avatarImg from "/icons/avatar.png";

function NavBar({
  userData,
  handleLogout,
  indexedHead,
  sourceHead,
  syncStatus,
  syncLag,
  syncPct,
  healthOnline,
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const hideLoginLink =
    location?.pathname === "/login" || location?.pathname === "/welcome";
  const { t } = useTranslation();

  const logout = () => handleLogout && handleLogout();
  const login = () => navigate("/login");

  const changeLanguage = (lng) => {
    localStorage.setItem("i18nextLng", lng);
    navigate(0);
  };

  const displayName =
    userData?.display_name ||
    userData?.username ||
    userData?.email ||
    "Account";
  const shortName =
    displayName.length > 20 ? displayName.slice(0, 17) + "…" : displayName;

  const userMenuTitle = (
    <span className="navbar-user-title nav-text">
      <Image
        src={userData?.avatar || avatarImg}
        alt="Profile avatar"
        onError={(e) => (e.currentTarget.src = avatarImg)}
        roundedCircle
        className="navbar-user-avatar"
      />
      <span className="navbar-user-name">{shortName}</span>
      <span className="navbar-user-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );

  const langItems = useMemo(
    () => [
      { code: "pt", label: "🇧🇷 Português (BR)" },
      { code: "en", label: "🇺🇸 English (US)" },
    ],
    [],
  );

  const currentLang = (i18n.language || "en").split("-")[0];

  const langMenuTitle = (
    <span className="navbar-lang-title nav-text">
      <span className="navbar-lang-label">{t("language")}</span>
      <span className="navbar-lang-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );

  function SyncRadial({ pct, state, tooltip }) {
    const size = 26;
    const stroke = 3.2;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    const hasPct = typeof pct === "number" && Number.isFinite(pct);
    const clamped = hasPct ? Math.max(0, Math.min(100, pct)) : 0;
    const dash = (clamped / 100) * c;

    return (
      <span className="app-sync" data-state={state}>
        <span className="app-sync-label">SYNC</span>

        <span className="app-sync-ring" aria-label={tooltip}>
          <svg
            className="app-sync-svg"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
          >
            <circle
              className="app-sync-track"
              cx={size / 2}
              cy={size / 2}
              r={r}
            />
            <circle
              className="app-sync-progress"
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeDasharray={`${dash} ${c - dash}`}
            />
            <path
              className="app-sync-slash"
              d={`M${size * 0.28} ${size * 0.72} L${size * 0.72} ${
                size * 0.28
              }`}
            />
          </svg>

          {hasPct && clamped < 100 ? (
            <span className="app-sync-ring-text">{clamped.toFixed(1)}</span>
          ) : null}
        </span>

        <span className="app-sync-tooltip" role="tooltip">
          {tooltip}
        </span>
      </span>
    );
  }

  return (
    <>
      <style>{`
        #navbar-user .dropdown-toggle::after { display: none !important; }
      `}</style>

      <Navbar
        data-bs-theme="dark"
        expand="lg"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        className="bg-body-tertiary app-navbar"
        sticky="top"
      >
        <Container fluid className="app-navbar-row">
          <Navbar.Brand
            as={Link}
            to="/"
            className="Navbar-brand-container nav-text"
          >
            <span className="Navbar-brand-slot">SAP</span>
          </Navbar.Brand>

          {userData && (
            <div className="navbar-status-bar">
              {(() => {
                const showChecking = healthOnline === null;
                const showOffline = healthOnline === false;
                const showSync = healthOnline === true;

                const isSynced =
                  typeof syncLag === "number" ? syncLag <= 50 : syncPct >= 100;
                const state = showOffline
                  ? "offline"
                  : showChecking
                    ? "checking"
                    : isSynced
                      ? "synced"
                      : "syncing";

                const pct = showSync ? syncPct : null;

                const statusCode = String(syncStatus?.code || "unknown");
                const isUnknown =
                  statusCode === "unknown" || statusCode === "checking";
                const isBlocked =
                  showOffline || isUnknown || healthOnline == null;

                const tooltip = isBlocked ? (
                  <div className="app-sync-tooltip-blocked">
                    <span className="app-tip-icon" aria-hidden="true">
                      !
                    </span>
                    <div className="app-sync-tooltip-text">
                      <div className="app-sync-tooltip-title">
                        {t("sync.tooltip.blockedTitle")}
                      </div>
                      <div className="app-sync-tooltip-body">
                        {showOffline
                          ? t("sync.tooltip.offlineBody")
                          : t("sync.tooltip.unknownBody")}
                      </div>
                    </div>
                  </div>
                ) : (
                  [
                    `${t("sync.tooltip.statusLabel")}: ${t(
                      `sync.status.${statusCode}`,
                    )}`,
                    `${t("sync.tooltip.indexedLabel")}: ${
                      indexedHead == null ? "—" : indexedHead.toLocaleString()
                    }`,
                    `${t("sync.tooltip.sourceLabel")}: ${
                      sourceHead == null ? "—" : sourceHead.toLocaleString()
                    }`,
                    `${t("sync.tooltip.lagLabel")}: ${
                      syncLag == null ? "—" : syncLag.toLocaleString()
                    } ${t("sync.tooltip.blocksSuffix")}`,
                  ].join("\n")
                );

                return (
                  <div className="status-item nav-text">
                    <SyncRadial pct={pct} state={state} tooltip={tooltip} />
                  </div>
                );
              })()}
            </div>
          )}

          <Navbar.Toggle aria-controls="app-navbar" />
          <Navbar.Collapse id="app-navbar" className="justify-content-end">
            <Nav className="ml-auto NavBar-top-container">
              {userData?.is_admin && (
                <Nav.Link
                  as={Link}
                  to="/admin"
                  className="nav-text"
                  onClick={() => setExpanded(false)}
                >
                  {t("nav.admin")}
                </Nav.Link>
              )}

              {userData && (
                <Nav.Link
                  as={Link}
                  to="/dashboard"
                  className="nav-text"
                  onClick={() => setExpanded(false)}
                >
                  Dashboard
                </Nav.Link>
              )}

              <Nav.Link
                className="nav-text"
                onClick={() => {
                  window.open(
                    "https://www.youtube.com/watch?v=nRsa_qiGhN0",
                    "_blank",
                    "noopener,noreferrer",
                  );
                  setExpanded(false);
                }}
              >
                {t("learnMore")}
              </Nav.Link>

              <NavDropdown
                title={langMenuTitle}
                id="navbar-lang"
                align="end"
                menuVariant="dark"
                className="nav-text"
              >
                {langItems.map((lng) => (
                  <NavDropdown.Item
                    key={lng.code}
                    onClick={() => {
                      changeLanguage(lng.code);
                      setExpanded(false);
                    }}
                  >
                    {lng.label}
                    {currentLang === lng.code ? (
                      <span className="Navbar-checkmark"> ✓</span>
                    ) : null}
                  </NavDropdown.Item>
                ))}
              </NavDropdown>

              {!userData && !hideLoginLink && (
                <Nav.Link
                  className="nav-text"
                  onClick={() => {
                    login();
                    setExpanded(false);
                  }}
                >
                  Log in
                </Nav.Link>
              )}

              {userData && (
                <NavDropdown
                  title={userMenuTitle}
                  id="navbar-user"
                  align="end"
                  menuVariant="dark"
                  className="navbar-user-dropdown"
                >
                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      navigate("/analyses");
                      setExpanded(false);
                    }}
                  >
                    {t("nav.analyses")}
                  </NavDropdown.Item>

                  <NavDropdown.Divider />
                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      navigate("/settings");
                      setExpanded(false);
                    }}
                  >
                    {t("nav.settings")}
                  </NavDropdown.Item>
                  <NavDropdown.Divider />
                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      logout();
                      setExpanded(false);
                    }}
                  >
                    {t("nav.logout")}
                  </NavDropdown.Item>
                </NavDropdown>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </>
  );
}

export default NavBar;
