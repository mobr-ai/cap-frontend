import "./../styles/NavBar.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Container from "react-bootstrap/Container";
import Image from "react-bootstrap/Image";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import NavDropdown from "react-bootstrap/NavDropdown";
import { Link, useNavigate } from "react-router-dom";
import i18n from "./../i18n";
import { useTranslation } from "react-i18next";

import avatarImg from "/icons/avatar.png";

function NavBar({
  userData,
  handleLogout,
  capBlock,
  cardanoBlock,
  syncStatus,
  healthOnline,
}) {
  const [expanded, setExpanded] = useState(false);
  const [brand, setBrand] = useState("");
  const brandRef = useRef("");
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Typing → pause → shrink animation
  useEffect(() => {
    const FULL = "Cardano Analytics Platform";
    const TARGET = "CAP";
    const TYPE_MS = 40,
      BACK_MS = 35,
      PAUSE_MS = 700;
    let stage = "type",
      i = 0,
      tId;

    const tick = () => {
      if (stage === "type") {
        if (i < FULL.length) {
          const next = FULL.slice(0, i + 1);
          brandRef.current = next;
          setBrand(next);
          i += 1;
          tId = setTimeout(tick, TYPE_MS);
        } else {
          stage = "pause";
          tId = setTimeout(tick, PAUSE_MS);
        }
      } else if (stage === "pause") {
        stage = "shrink";
        tId = setTimeout(tick, BACK_MS);
      } else {
        const current = brandRef.current || FULL;
        if (current.length > TARGET.length) {
          const next = current.slice(0, -1);
          brandRef.current = next;
          setBrand(next);
          tId = setTimeout(tick, BACK_MS);
        } else {
          brandRef.current = TARGET;
          setBrand(TARGET);
          clearTimeout(tId);
        }
      }
    };
    tick();
    return () => clearTimeout(tId);
  }, []);

  const logout = () => handleLogout && handleLogout();
  const login = () => navigate("/login");

  const changeLanguage = (lng) => {
    localStorage.setItem("i18nextLng", lng);
    navigate(0);
  };

  // Status indicators
  const showChecking = healthOnline === null;
  const showOffline = healthOnline === false;
  const showSync = healthOnline === true;

  const displayName = String(userData?.username || "Account").trim();
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
    []
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
        className="bg-body-tertiary cap-navbar"
        sticky="top"
      >
        <Container fluid className="cap-navbar-row">
          {/* Brand */}
          <Navbar.Brand
            as={Link}
            to="/"
            className="Navbar-brand-container nav-text"
          >
            {/* <img
              alt="CAP"
              src="/icons/logo.png"
              width="32"
              height="32"
              className="d-inline-block align-top Navbar-brand-img"
            /> */}
            <span className="Navbar-brand-slot">{brand || "CAP"}</span>
          </Navbar.Brand>

          {/* Status line (hidden on very small screens via CSS) */}
          {userData && (
            <div className="navbar-status-bar">
              <div className="status-item w-140 nav-text">
                <span className="label">CAP:</span>
                <span className="value">
                  {capBlock == null ? "—" : capBlock.toLocaleString()}
                </span>
              </div>
              <div className="status-item w-160 nav-text">
                <span className="label">Cardano:</span>
                <span className="value">
                  {cardanoBlock == null ? "—" : cardanoBlock.toLocaleString()}
                </span>
              </div>

              {showSync && (
                <div
                  className={`status-item w-160 sync ${
                    syncStatus?.cls || ""
                  } nav-text`}
                >
                  <span className="dot" />
                  <span className="value">{syncStatus?.text || "—"}</span>
                </div>
              )}
              {showChecking && (
                <div className="status-item w-120 checking nav-text">
                  <span className="dot amber" />
                  <span className="value">Checking…</span>
                </div>
              )}
              {showOffline && (
                <div className="status-item w-120 offline nav-text">
                  <span className="dot red" />
                  <span className="value">Offline</span>
                </div>
              )}
            </div>
          )}

          <Navbar.Toggle aria-controls="cap-navbar" />
          <Navbar.Collapse id="cap-navbar" className="justify-content-end">
            <Nav className="ml-auto NavBar-top-container">
              {/* Admin entry (only for admins) */}
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
              {/* Dashboard entry (important for mobile where sidebar is hidden) */}
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

              {/* Learn more link */}
              <Nav.Link
                className="nav-text"
                onClick={() => {
                  window.open(
                    "https://mobr.ai",
                    "_blank",
                    "noopener,noreferrer"
                  );
                  setExpanded(false);
                }}
              >
                {t("learnMore")}
              </Nav.Link>

              {/* Language dropdown */}
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

              {!userData && (
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
