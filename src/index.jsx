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

// Pages
import AuthPage from "./pages/AuthPage";
import WaitingListPage from "./pages/WaitingListPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";

// Hooks
import { useAuthRequest } from "./hooks/useAuthRequest";
import useSyncStatus from "./hooks/useSyncStatus";

// Components
import Header from "./components/Header";

// ---------------------------
// Layout wrapper
// ---------------------------
function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem("cap_user_session");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // --- Toasts ---------------------------------------------------------------
  const [toast, setToast] = useState({
    show: false,
    message: "",
    variant: "secondary",
  });
  const showToast = useCallback((message, variant = "secondary") => {
    setToast({ show: true, message, variant });
  }, []);

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
    [location.state, navigate]
  );

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem("cap_user_session");
    } catch {}
    setSession(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  const outletContext = useMemo(
    () => ({
      session,
      user: session, // alias for components expecting `user`
      setUser: setSession, // alias for components expecting `setUser`
      handleLogout,
      handleLogin,
      setLoading,
      loading,
      showToast,
    }),
    [session, showToast, handleLogout, handleLogin, loading]
  );

  // const authFetchBare = useCallback(
  //   async (url, options = {}) => {
  //     const token = session?.access_token;
  //     if (!token) throw new Error("No token");
  //     const headers = {
  //       "Content-Type": "application/json",
  //       ...(options.headers || {}),
  //       Authorization: `Bearer ${token}`,
  //     };
  //     const resp = await fetch(withBase(url), {
  //       credentials: "include",
  //       ...options,
  //       headers,
  //     });
  //     if (resp.status === 401 || resp.status === 403) {
  //       // If a real 401 happens later, then logout
  //       handleLogout();
  //       throw new Error("Unauthorized");
  //     }
  //     return resp;
  //   },
  //   [session, handleLogout]
  // );

  // --- Authenticated fetch wrapper -----------------------------------------
  const { authFetch } = useAuthRequest({ session, showToast, handleLogout });

  // --- CAP status polling (health + sync)
  const { healthOnline, capBlock, cardanoBlock, syncStatus } = useSyncStatus(
    session ? authFetch : null
  );

  // --- Enforce allowed routes (login, signup) when not logged
  useEffect(() => {
    const allowlist = new Set(["/login", "/signup"]);
    if (!session && !allowlist.has(location.pathname)) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [session, location.pathname, navigate]);

  return (
    <>
      <Header
        user={session}
        handleLogout={handleLogout}
        capBlock={capBlock}
        cardanoBlock={cardanoBlock}
        syncStatus={syncStatus}
        healthOnline={healthOnline}
      />

      <ToastContainer
        position="bottom-end"
        className="p-3"
        style={{ zIndex: 9999 }}
      >
        <Toast
          bg={toast.variant}
          onClose={() => setToast({ ...toast, show: false })}
          show={toast.show}
          delay={5000}
          autohide
        >
          <Toast.Body className="text-white">
            {toast.message.split("\n").map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      <Outlet context={outletContext} />
    </>
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
            <Route path="/dashboard" element={<DashboardPage />} />
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
