// src/index.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "react-bootstrap/Image";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/index.css";

// i18n first
import "./i18n";
import { useTranslation } from "react-i18next";

// Pages
import AuthPage from "./pages/AuthPage";
import WaitingListPage from "./pages/WaitingListPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import AnalysesPage from "./pages/AnalysesPage";
import UserQueryMetricsPage from "./pages/UserQueryMetricsPage";
import LoadingPage from "./pages/LoadingPage";

// Hooks
import { useAuthRequest } from "./hooks/useAuthRequest";
import useSyncStatus from "./hooks/useSyncStatus";

// Components
import Header from "./components/Header";

function getInitialSession() {
  try {
    const raw = localStorage.getItem("cap_user_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialLoading() {
  try {
    const raw = localStorage.getItem("cap_user_session");
    const sess = raw ? JSON.parse(raw) : null;
    const path = window.location.pathname;
    if (!sess) return false;
    // Start with loader ON for dashboard (and optionally landing)
    return path === "/dashboard";
  } catch {
    return false;
  }
}

// ---------------------------
// Layout wrapper
// ---------------------------
function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(getInitialLoading);
  const [session, setSession] = useState(getInitialSession);

  const [sidebarIsOpen, setSidebarOpen] = useState(false);

  // --- Toasts ---------------------------------------------------------------
  const [toast, setToast] = useState({
    show: false,
    message: "",
    variant: "secondary",
    onClick: null,
  });

  const showToast = useCallback(
    (message, variant = "secondary", options = {}) => {
      setToast({
        show: true,
        message,
        variant,
        onClick: options.onClick || null,
      });
    },
    [],
  );

  // --- Auth & Session -------------------------------------------------------
  const handleLogin = useCallback(
    (userObj) => {
      try {
        localStorage.setItem("cap_user_session", JSON.stringify(userObj));
        setSession(userObj);
      } catch {}
      const from = (location.state && location.state.from) || "/";
      navigate(from, { replace: true });
    },
    [location.state, navigate],
  );

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem("cap_user_session");
    } catch {}
    setSession(null);
    setSidebarOpen(false);
    navigate("/login", { replace: true });
  }, [navigate]);

  // --- Authenticated fetch wrapper -----------------------------------------
  const { authFetch } = useAuthRequest({ session, showToast, handleLogout });

  // --- CAP status polling (health + sync)
  const { healthOnline, capBlock, cardanoBlock, syncStatus, syncPct, syncLag } =
    useSyncStatus(session ? authFetch : null);

  const setUser = useCallback((next) => {
    setSession((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      try {
        localStorage.setItem("cap_user_session", JSON.stringify(resolved));
      } catch {}
      return resolved;
    });
  }, []);

  const outletContext = useMemo(
    () => ({
      session,
      user: session,
      setUser: setUser,
      handleLogout,
      handleLogin,
      showToast,
      setLoading,
      loading,
      healthOnline,
      capBlock,
      cardanoBlock,
      syncStatus,
      syncPct,
      syncLag,
    }),
    [
      session,
      showToast,
      handleLogout,
      handleLogin,
      loading,
      healthOnline,
      capBlock,
      cardanoBlock,
      syncStatus,
      syncPct,
      syncLag,
    ],
  );

  // --- Enforce allowed routes when not logged in ---------------------------
  useEffect(() => {
    const allowlist = new Set(["/login", "/signup"]);
    if (!session && !allowlist.has(location.pathname)) {
      setSidebarOpen(false);
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [session, location.pathname, navigate]);

  return (
    <div id="outer-container">
      {/* Header is part of the page wrap so it shifts with content */}
      <div id="page-wrap">
        <Header
          user={session}
          handleLogout={handleLogout}
          capBlock={capBlock}
          cardanoBlock={cardanoBlock}
          syncStatus={syncStatus}
          syncLag={syncLag}
          syncPct={syncPct}
          healthOnline={healthOnline}
          sidebarIsOpen={sidebarIsOpen}
          setSidebarOpen={setSidebarOpen}
          authFetch={authFetch}
        />
        {loading && (
          <LoadingPage
            type="ring" // try "spin", "pulse", "orbit", "ring"
            fullscreen={true}
            message={t("loading.workspace")}
          />
        )}

        <ToastContainer
          position="bottom-end"
          containerPosition="fixed"
          className="p-3"
          style={{ zIndex: 9999 }}
        >
          <Toast
            bg={toast.variant}
            onClose={() => setToast((prev) => ({ ...prev, show: false }))}
            show={toast.show}
            delay={5000}
            autohide
            onClick={toast.onClick || undefined}
            style={{ cursor: toast.onClick ? "pointer" : "default" }}
          >
            <Toast.Body className="text-white">
              {toast.message.split("\n").map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </Toast.Body>
          </Toast>
        </ToastContainer>

        <Outlet context={outletContext} />
      </div>
    </div>
  );
}

// ---------------------------
// App Router
// ---------------------------
function AppRouter() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/conversations/:conversationId"
              element={<LandingPage />}
            />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/analyses" element={<AnalysesPage />} />
            <Route path="/analyses" element={<AnalysesPage />} />
            <Route
              path="/admin/users/:userId/queries"
              element={<UserQueryMetricsPage />}
            />
            <Route path="/login" element={<AuthPage type="login" />} />
            <Route path="/signup" element={<WaitingListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

// ---------------------------
// 404 Page
// ---------------------------
function NotFound() {
  return (
    <div className="container py-5">
      <Image className="Auth-logo" src="./icons/logo.png" alt="CAP logo" />

      <h3 className="mb-3">Page not found</h3>
      <p>
        The page you’re looking for doesn’t exist. Go to{" "}
        <a href="/login">Login</a> or <a href="/signup">Sign up</a>.
      </p>
    </div>
  );
}

// ---------------------------
// Mount
// ---------------------------
createRoot(document.getElementById("root")).render(<AppRouter />);
