// src/hooks/useAuthRequest.js
import { useNavigate, useOutletContext } from "react-router-dom";
import request from "superagent";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

// Prefix relative URLs with API_BASE (if defined)
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

    // Allow passing either { session, ... } OR a raw session-like object with access_token
    const merged = { ...outlet, ...overrides };
    const session =
        merged.session ??
        (merged && typeof merged === "object" && "access_token" in merged ? merged : undefined);

    const { showToast, handleLogout } = merged;

    const unauthorized = () => {
        try {
            localStorage.removeItem("cap_user_session");
        } catch { }
        const onLogin =
            typeof window !== "undefined" && window.location.pathname.startsWith("/login");
        if (showToast && !onLogin) showToast("Session expired. Please sign in again.", "secondary");
        if (handleLogout) handleLogout();
        if (!onLogin) navigate("/login?sessionExpired=1", { replace: true });
    };

    // --- Header helpers -------------------------------------------------------
    const addAuthAndCommon = (headers = {}) => {
        const token = session?.access_token;
        const out = { "X-Requested-With": "XMLHttpRequest", ...headers };
        if (token) out["Authorization"] = `Bearer ${token}`;
        return out;
    };

    /**
     * Build headers for fetch:
     * - NEVER set Content-Type for FormData (browser must add the boundary)
     * - Auto-set Content-Type: application/json when there is a non-FormData body
     * - Allow forcing JSON via includeJsonContentType
     */
    const buildFetchHeaders = (options = {}) => {
        const { headers: extra = {}, body, includeJsonContentType } = options;

        const isFormData =
            typeof FormData !== "undefined" && body instanceof FormData;

        // Start with auth + common
        const base = addAuthAndCommon(extra);

        // Respect explicit Content-Type if caller set it
        if (Object.keys(base).some((k) => k.toLowerCase() === "content-type")) {
            return base;
        }

        // If caller explicitly asked for JSON, set it
        if (includeJsonContentType === true) {
            return { ...base, "Content-Type": "application/json" };
        }

        // If body exists and is NOT FormData, default to JSON
        if (body && !isFormData) {
            return { ...base, "Content-Type": "application/json" };
        }

        // Otherwise, omit Content-Type (GETs, FormData uploads, etc.)
        return base;
    };

    /**
     * Public helper for places where you just need the headers object,
     * e.g. XHR upload flows.
     *
     * getAuthHeaders({ includeJsonContentType?: boolean, headers?: {} })
     */
    const getAuthHeaders = (opts = {}) => {
        const { includeJsonContentType = false, headers = {} } = opts;
        if (includeJsonContentType) {
            return addAuthAndCommon({ ...headers, "Content-Type": "application/json" });
        }
        // No Content-Type by default
        return addAuthAndCommon(headers);
    };

    // --- fetch wrappers -------------------------------------------------------
    const authFetch = async (url, options = {}) => {
        const token = session?.access_token;
        if (!token) {
            unauthorized();
            throw new Error("No token");
        }

        let resp;
        try {
            resp = await fetch(withBase(url), {
                credentials: "include",
                ...options,
                headers: buildFetchHeaders(options),
            });
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
        // If caller is sending a raw object body, ensure it's stringified.
        let finalOptions = { ...options };
        const isFormData =
            finalOptions && typeof FormData !== "undefined" && finalOptions.body instanceof FormData;

        if (finalOptions.body && !isFormData && typeof finalOptions.body !== "string") {
            finalOptions = {
                ...finalOptions,
                body: JSON.stringify(finalOptions.body),
                includeJsonContentType: true,
            };
        }

        const res = await authFetch(url, finalOptions);
        const text = await res.text();
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            return { _raw: text };
        }
    };

    const authText = async (url, options = {}) => (await authFetch(url, options)).text();

    // --- superagent decorators -----------------------------------------------
    const decorate = (req) => {
        const token = session?.access_token;
        if (!token) {
            unauthorized();
            return req;
        }
        req.set("Authorization", `Bearer ${token}`);
        req.set("X-Requested-With", "XMLHttpRequest");

        const originalEnd = req.end.bind(req);
        req.end = (cb) =>
            originalEnd((err, res) => {
                const status = err?.status ?? res?.status;
                if (shouldUnauthorized(status)) unauthorized();
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

    return { getAuthHeaders, authFetch, authJson, authText, authRequest };
}
