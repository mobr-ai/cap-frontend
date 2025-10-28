// src/hooks/useAuthRequest.js
import { useNavigate, useOutletContext } from "react-router-dom";
import request from "superagent";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
const withBase = (url) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (!API_BASE) return url;
    return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
};
const shouldUnauthorized = (s) => s === 401 || s === 403;

export function useAuthRequest(overrides = {}) {
    const navigate = useNavigate();
    const outlet = useOutletContext() || {};

    // Prefer explicit overrides (for use in Layout), otherwise outlet context (for children)
    const { session, showToast, handleLogout } = { ...outlet, ...overrides };

    const unauthorized = () => {
        try { localStorage.removeItem("cap_user_session"); } catch { }
        const onLogin = typeof window !== "undefined" && window.location.pathname.startsWith("/login");
        if (showToast && !onLogin) showToast("Session expired. Please sign in again.", "secondary");
        if (handleLogout) handleLogout();
        if (!onLogin) navigate("/login?sessionExpired=1", { replace: true });
    };

    const buildHeaders = (extra = {}) => {
        const token = session?.access_token;
        const base = { "Content-Type": "application/json", ...extra };
        return token ? { ...base, Authorization: `Bearer ${token}` } : base;
    };

    const authFetch = async (url, options = {}) => {
        const token = session?.access_token;
        if (!token) {
            unauthorized();
            throw new Error("No token");
        }
        let resp;
        try {
            resp = await fetch(withBase(url), { credentials: "include", ...options, headers: buildHeaders(options.headers) });
        } catch (err) {
            throw new Error(`Network error: ${err?.message || "unknown"}`);
        }
        if (shouldUnauthorized(resp.status)) {
            unauthorized();
            throw new Error("Unauthorized");
        }
        return resp;
    };

    const authJson = async (url, options = {}) => {
        const res = await authFetch(url, options);
        const text = await res.text();
        try { return text ? JSON.parse(text) : {}; } catch { return { _raw: text }; }
    };
    const authText = async (url, options = {}) => (await authFetch(url, options)).text();

    const decorate = (req) => {
        const token = session?.access_token;
        if (!token) { unauthorized(); return req; }
        req.set("Authorization", `Bearer ${token}`);
        const originalEnd = req.end.bind(req);
        req.end = (cb) => originalEnd((err, res) => {
            if ((err && shouldUnauthorized(err.status)) || (res && shouldUnauthorized(res.status))) unauthorized();
            cb && cb(err, res);
        });
        return req;
    };

    const authRequest = {
        get: (url) => decorate(request.get(withBase(url))),
        post: (url) => decorate(request.post(withBase(url))),
        put: (url) => decorate(request.put(withBase(url))),
        delete: (url) => decorate(request.delete(withBase(url))),
        patch: (url) => decorate(request.patch(withBase(url))),
    };

    return { authFetch, authJson, authText, authRequest };
}
