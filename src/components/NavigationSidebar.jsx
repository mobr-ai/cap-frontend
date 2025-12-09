// src/components/NavigationSidebar.jsx
import React from "react";
import { slide as Menu } from "react-burger-menu";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faGaugeHigh,
  faCog,
  faArrowRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import "../styles/NavigationSidebar.css";

const menuStyles = {
  bmOverlay: {
    background: "rgba(15, 23, 42, 0.65)", // dark translucent, matches theme
    backdropFilter: "blur(2px)",
    zIndex: 1200, // below menu, above page
  },
  bmMenuWrap: {
    background: "#0f172a", // deep slate like navbar
    zIndex: 1300,
  },
  bmMenu: {
    background: "#0f172a",
    padding: "1.5rem 1rem",
  },
};

export default function NavigationSidebar({
  isOpen,
  setIsOpen,
  handleLogout,
  user,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  if (typeof window !== "undefined" && window.innerWidth < 1024) return null;

  const handleNav = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  const isActive = (path, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <Menu
      className="cap-sidebar"
      isOpen={isOpen}
      customBurgerIcon={false}
      onStateChange={(state) => setIsOpen(state.isOpen)}
      right={false}
      outerContainerId="outer-container"
      pageWrapId="page-wrap"
      styles={menuStyles} // <-- key line
    >
      <div className="sidebar-header">
        <img src="/icons/logo.png" alt="CAP" className="sidebar-logo" />
        <div className="sidebar-title">CAP</div>
      </div>

      <nav className="sidebar-nav">
        <Link
          to="/"
          onClick={() => handleNav("/")}
          className={`sidebar-item ${isActive("/", true) ? "active" : ""}`}
        >
          <FontAwesomeIcon icon={faHouse} />
          <span>{t("nav.home")}</span>
        </Link>

        <Link
          to="/dashboard"
          onClick={() => handleNav("/dashboard")}
          className={`sidebar-item ${isActive("/dashboard") ? "active" : ""}`}
        >
          <FontAwesomeIcon icon={faGaugeHigh} />
          <span>{t("nav.dashboard")}</span>
        </Link>

        <Link
          to="/settings"
          onClick={() => handleNav("/settings")}
          className={`sidebar-item ${
            isActive("/settings", true) ? "active" : ""
          }`}
        >
          <FontAwesomeIcon icon={faCog} />
          <span>{t("nav.settings")}</span>
        </Link>

        {user && (
          <>
            <div className="sidebar-divider" />
            <button
              className="sidebar-item logout"
              onClick={() => {
                if (handleLogout) handleLogout();
                setIsOpen(false);
              }}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
              <span>{t("nav.logout")}</span>
            </button>
          </>
        )}
      </nav>

      <footer className="sidebar-footer">
        <span>v0.1.0</span>
        <span className="muted">© MOBR Systems</span>
      </footer>
    </Menu>
  );
}
