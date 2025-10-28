// src/components/NavigationSidebar.jsx
import React from "react";
import { slide as Menu } from "react-burger-menu";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHome,
  faChartLine,
  faBrain,
  faCog,
  faArrowRightFromBracket,
} from "@fortawesome/free-solid-svg-icons";
import "../styles/NavigationSidebar.css";

export default function NavigationSidebar({
  isOpen,
  setIsOpen,
  handleLogout,
  user,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide entirely on mobile (we already have collapse NavBar there)
  if (window.innerWidth < 1024) return null;

  const handleNav = (path) => {
    setIsOpen(false);
    navigate(path);
  };

  return (
    <Menu
      className="cap-sidebar"
      isOpen={isOpen}
      customBurgerIcon={false}
      onStateChange={(state) => setIsOpen(state.isOpen)}
    >
      <div className="sidebar-header">
        <img src="/icons/logo.png" alt="CAP" className="sidebar-logo" />
        <div className="sidebar-title">CAP</div>
      </div>

      <nav className="sidebar-nav">
        <Link
          to="/"
          onClick={() => handleNav("/")}
          className={`sidebar-item ${
            location.pathname === "/" ? "active" : ""
          }`}
        >
          <FontAwesomeIcon icon={faHome} /> Home
        </Link>

        <Link
          to="/analytics"
          onClick={() => handleNav("/analytics")}
          className={`sidebar-item ${
            location.pathname.includes("/analytics") ? "active" : ""
          }`}
        >
          <FontAwesomeIcon icon={faChartLine} /> Analytics
        </Link>

        <Link
          to="/query"
          onClick={() => handleNav("/query")}
          className={`sidebar-item ${
            location.pathname.includes("/query") ? "active" : ""
          }`}
        >
          <FontAwesomeIcon icon={faBrain} /> AI Query
        </Link>

        <Link
          to="/settings"
          onClick={() => handleNav("/settings")}
          className={`sidebar-item ${
            location.pathname === "/settings" ? "active" : ""
          }`}
        >
          <FontAwesomeIcon icon={faCog} /> Settings
        </Link>

        {user && (
          <>
            <div className="sidebar-divider" />
            <button
              className="sidebar-item logout"
              onClick={() => {
                handleLogout && handleLogout();
                setIsOpen(false);
              }}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} /> Logout
            </button>
          </>
        )}
      </nav>

      <footer className="sidebar-footer">
        <span>v1.0.0</span>
        <span className="muted">© MOBR Systems</span>
      </footer>
    </Menu>
  );
}
