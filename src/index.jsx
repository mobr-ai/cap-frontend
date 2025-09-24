// src/index.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Bootstrap & global styles
import "./styles/index.css";
import "bootstrap/dist/css/bootstrap.min.css";

// Initialize i18n before pages use it
import "./i18n";

// Pages
import AuthPage from "./pages/AuthPage";
import WaitingListPage from "./pages/WaitingListPage";

// React-Bootstrap Toasts
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";

// -----------------------------------------------------------------------------
// App layout that provides context expected by AuthPage:
//   { handleLogin, setLoading, loading, showToast }
// -----------------------------------------------------------------------------
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

  // --- Toast handling --------------------------------------------------------
  const [toast, setToast] = useState({
    show: false,
    message: "",
    variant: "secondary",
  });
  const showToast = useCallback((message, variant = "secondary") => {
    setToast({ show: true, message, variant });
  }, []);

  // --- Session helpers -------------------------------------------------------
  const handleLogin = useCallback(
    (userObj) => {
      // Persist session (JWT, user info)
      try {
        localStorage.setItem("cap_user_session", JSON.stringify(userObj));
        setSession(userObj);
      } catch {
        /* ignore storage errors */
      }
      // Navigate after login: redirect to next or home
      const from = (location.state && location.state.from) || "/";
      navigate(from, { replace: true });
    },
    [location.state, navigate]
  );

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem("cap_user_session");
    } catch {
      /* ignore */
    }
    setSession(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  // Expose context to children (AuthPage will read these via useOutletContext)
  const outletContext = useMemo(
    () => ({
      handleLogin,
      setLoading,
      loading,
      showToast,
      session,
      handleLogout,
    }),
    [handleLogin, loading, showToast, session, handleLogout]
  );

  // Simple auth guard for future private routes
  useEffect(() => {
    // If a token is present, auto-refresh or validate here
  }, [session]);

  return (
    <>
      {/* App-wide Toasts */}
      <ToastContainer
        position="top-center"
        className="p-3"
        containerPosition="fixed"
      >
        <Toast
          bg={
            toast.variant === "danger"
              ? "danger"
              : toast.variant === "success"
              ? "success"
              : "secondary"
          }
          onClose={() => setToast((t) => ({ ...t, show: false }))}
          show={toast.show}
          delay={4000}
          autohide
        >
          <Toast.Body className="text-white">{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Routed content */}
      <Outlet context={outletContext} />
    </>
  );
}

// -----------------------------------------------------------------------------
// Google OAuth Provider wrapper
// -----------------------------------------------------------------------------
function AppRouter() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Auth routes */}
            <Route path="/login" element={<AuthPage type="login" />} />
            {/* In CAP, /signup is currently the waiting list registration page */}
            <Route path="/signup" element={<WaitingListPage />} />

            {/* Landing → redirect to login (adjust when adding a dashboard/home) */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            {/* Fallback 404 */}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

// Simple 404 page (minimal to keep focus on auth)
function NotFound() {
  return (
    <div className="container py-5">
      <h3 className="mb-3">Page not found</h3>
      <p>
        The page you’re looking for doesn’t exist. Go to{" "}
        <a href="/login">Login</a> or <a href="/signup">Sign up</a>.
      </p>
    </div>
  );
}

// Bootstrap the app
createRoot(document.getElementById("root")).render(<AppRouter />);
