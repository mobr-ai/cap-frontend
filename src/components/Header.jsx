// src/components/Header.jsx
import NavBar from "./NavBar";
import NavigationSidebar from "./NavigationSidebar";
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
  const showSidebar = !!user && !!setSidebarOpen;

  return (
    <>
      {showSidebar && (
        <button
          className="Navbar-toggle-btn"
          onClick={() => setSidebarOpen(!sidebarIsOpen)}
          title="Toggle navigation"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
      )}

      {showSidebar && (
        <NavigationSidebar
          isOpen={sidebarIsOpen}
          setIsOpen={setSidebarOpen}
          handleLogout={handleLogout}
          user={user}
        />
      )}

      <div className={showSidebar ? "has-left-burger" : ""}>
        <NavBar
          userData={user}
          handleLogout={handleLogout}
          capBlock={capBlock}
          cardanoBlock={cardanoBlock}
          syncStatus={syncStatus}
          healthOnline={healthOnline}
        />
      </div>
    </>
  );
}
