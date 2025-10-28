// src/components/Header.jsx
import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";

import NavBar from "./NavBar"; // our enhanced CAP NavBar (with analytics + animation)
import NavigationSidebar from "./NavigationSidebar"; // optional sidebar for logged users

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import "../styles/NavBar.css";

export default function Header({
  user,
  handleLogout,
  capBlock,
  cardanoBlock,
  syncStatus,
  healthOnline,
  sidebarIsOpen,
  setSidebarOpen,
}) {
  return (
    <>
      {/* Optional sidebar toggle (desktop only) */}
      {user && (
        <button
          className="Navbar-toggle-btn"
          onClick={() => setSidebarOpen && setSidebarOpen(!sidebarIsOpen)}
          title="Toggle navigation"
          style={{
            position: "absolute",
            top: "0.6rem",
            left: "1rem",
            background: "none",
            border: "none",
            color: "#f1f5f9",
            fontSize: "1.25rem",
          }}
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
      )}

      {/* Optional collapsible sidebar menu () */}
      {user && setSidebarOpen && (
        <NavigationSidebar
          isOpen={sidebarIsOpen}
          setIsOpen={setSidebarOpen}
          handleLogout={handleLogout}
          user={user}
        />
      )}

      {/* Main CAP NavBar with analytics and branding animation */}
      <NavBar
        userData={user}
        handleLogout={handleLogout}
        capBlock={capBlock}
        cardanoBlock={cardanoBlock}
        syncStatus={syncStatus}
        healthOnline={healthOnline}
      />
    </>
  );
}
