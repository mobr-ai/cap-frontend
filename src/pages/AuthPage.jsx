// src/pages/AuthPage.jsx
import i18n from "../i18n";
import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import reactStringReplace from "react-string-replace";
import Image from "react-bootstrap/Image";
import Container from "react-bootstrap/Container";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import {
  NavLink,
  useOutletContext,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { useGoogleOneTapLogin } from "@react-oauth/google";
import "../styles/AuthPage.css";
import CardanoWalletLogin from "../components/wallet/CardanoWalletLogin";
import LoadingPage from "./LoadingPage";

/**
 * AuthPage (CAP)
 * - Email/password login/signup
 * - Google OAuth (redirect implicit) -> returns access_token in URL hash
 * - Cardano wallet login
 *
 * Important:
 * - Google Cloud Console must include the exact redirect URI used here
 *   (Authorized redirect URIs) or you will get redirect_uri_mismatch.
 */
function AuthPage(props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { handleLogin, setLoading, loading, showToast } = useOutletContext();

  const [processing, setProcessing] = useState(false);
  const [email, setEmail] = useState();
  const [pass, setPass] = useState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmationError, setConfirmationError] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Prevent double-processing if user refreshes quickly
  const googleHandledHashRef = useRef(false);

  useGoogleOneTapLogin({
    onSuccess: async (credentialResponse) => {
      try {
        setLoading(true);
        await handleGoogleResponse(
          { credential: credentialResponse?.credential },
          handleLogin,
        );
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      // no loader needed; user didn’t complete sign-in
    },
    disabled: loading || processing,
    cancel_on_tap_outside: false,
  });

  // ---- Helpers --------------------------------------------------------------

  const isValidEmail = (s) => {
    if (typeof s !== "string") return false;
    const v = s.trim();
    if (v.length < 3) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const normalizeApiErrorKey = (err) => {
    const detail = err?.detail ?? err?.error ?? err;

    if (typeof detail === "string" && detail.trim()) return detail.trim();

    if (Array.isArray(detail)) {
      const asText = JSON.stringify(detail).toLowerCase();
      if (asText.includes('"email"') || asText.includes("email address"))
        return "invalidEmailFormat";
      return "requestInvalid";
    }

    if (detail && typeof detail === "object") {
      const asText = JSON.stringify(detail).toLowerCase();
      if (asText.includes('"email"') || asText.includes("email address"))
        return "invalidEmailFormat";
      return "requestInvalid";
    }

    return "loginError";
  };

  const currentLang = () =>
    i18n.language?.split("-")[0] ||
    window.localStorage.i18nextLng?.split("-")[0] ||
    "en";

  // ---- Email auth -----------------------------------------------------------

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    try {
      const res = await fetch("/api/v1/resend_confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language: currentLang() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "errorResendingConfirmation");
      }
      showToast(t("confirmationEmailResent"), "success");
    } catch (error) {
      showToast(t(error.message) || t("errorResendingConfirmation"), "danger");
    } finally {
      setResendLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    const endpoint =
      props.type === "create" ? "/api/v1/register" : "/api/v1/login";
    setProcessing(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: pass,
          remember_me: rememberMe,
          language: currentLang(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errKey = normalizeApiErrorKey(errorData);

        if (errKey === "confirmationError") {
          setConfirmationError(true);
          return;
        }

        throw new Error(errKey);
      }

      const result = await response.json();

      if (props.type === "login" && result?.access_token) {
        handleLogin(result);
      }

      if (result?.redirect) {
        navigate(result.redirect);
      }
    } catch (error) {
      const key = normalizeApiErrorKey(error?.message || error);
      showToast(t(key), "danger");
    } finally {
      setProcessing(false);
    }
  };

  // ---- Google OAuth (redirect implicit) -------------------------------------

  const getGoogleRedirectUri = () => {
    // Prefer explicit env var to avoid mismatch
    // Example:
    // VITE_GOOGLE_REDIRECT_URI=http://localhost:5173/login
    // VITE_GOOGLE_REDIRECT_URI=https://cap.mobr.ai/login
    const envUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    if (typeof envUri === "string" && envUri.trim()) return envUri.trim();

    // Fallback: keep it stable and predictable
    // If you use this fallback, ensure Google Console includes:
    // - http://localhost:5173/login
    // - https://cap.mobr.ai/login
    return `${window.location.origin}/login`;
  };

  const buildGoogleImplicitUrl = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = getGoogleRedirectUri();

    // Store a state to reduce accidental reuse
    const state = `cap_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    try {
      sessionStorage.setItem("cap_google_oauth_state", state);
    } catch {
      // ignore
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token", // implicit: access_token in hash
      scope: "openid email profile",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleGoogleResponse = async (tokenResponse, onSuccess) => {
    try {
      const token =
        tokenResponse?.access_token || tokenResponse?.credential || null;
      const tokenType = tokenResponse?.access_token
        ? "access_token"
        : "id_token";

      if (!token) throw new Error("missingGoogleToken");

      const res = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          token_type: tokenType,
          remember_me: rememberMe,
          language: currentLang(),
        }),
      });

      if (!res.ok) {
        let errMsg = "googleAuthFailed";
        try {
          const err = await res.json();
          errMsg = err?.detail || err?.error || errMsg;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      let apiResponse = {};
      try {
        apiResponse = await res.json();
      } catch {
        throw new Error("invalidApiResponse");
      }

      if (apiResponse?.access_token) {
        onSuccess?.(apiResponse);
        return;
      }

      if (apiResponse?.status === "pending_confirmation") {
        const pendingEmail = apiResponse?.email || "";
        navigate(
          `/signup?state=already${
            pendingEmail ? `&email=${encodeURIComponent(pendingEmail)}` : ""
          }`,
        );
        return;
      }

      throw new Error("invalidApiResponse");
    } catch (err) {
      console.error("Authentication Error:", err);
      showToast(t(err?.message || "googleAuthFailed"), "danger");
    }
  };

  // Parse OAuth hash on return: #access_token=...&token_type=Bearer&state=...
  useEffect(() => {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return;
    if (googleHandledHashRef.current) return;

    const qs = new URLSearchParams(hash.slice(1));

    // If Google returned an error in the hash
    const err = qs.get("error");
    if (err) {
      googleHandledHashRef.current = true;

      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );

      // Typical values: access_denied, interaction_required, etc.
      const lower = String(err).toLowerCase();
      if (lower.includes("access_denied")) {
        showToast(t("googleAuthCancelled"), "secondary");
      } else {
        showToast(t("googleAuthFailed"), "danger");
      }
      return;
    }

    const accessToken = qs.get("access_token");
    const tokenType = qs.get("token_type") || "Bearer";
    const state = qs.get("state") || "";

    if (!accessToken) return;

    googleHandledHashRef.current = true;

    // Optional: verify state
    try {
      const expected = sessionStorage.getItem("cap_google_oauth_state") || "";
      if (expected && state && expected !== state) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        showToast(t("googleAuthFailed"), "danger");
        return;
      }
      sessionStorage.removeItem("cap_google_oauth_state");
    } catch {
      // ignore
    }

    // Clean URL (remove token from address bar)
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    setLoading(true);
    handleGoogleResponse(
      { access_token: accessToken, token_type: tokenType },
      handleLogin,
    ).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Email "two-step" UX --------------------------------------------------

  const handleAuthStep = useCallback(() => {
    if (!email) {
      const el = document.getElementById("Auth-input-text");
      const value = el?.value?.trim();

      if (!value) return;

      if (!isValidEmail(value)) {
        showToast(t("invalidEmailFormat"), "danger");
        return;
      }

      setEmail(value);
      return;
    }

    if (email && !pass) {
      if (passwordInput?.length > 0) setPass(passwordInput);
      return;
    }

    if (email && pass && !processing) {
      handleEmailAuth();
    }
  }, [email, pass, passwordInput, processing, showToast, t]);

  useEffect(() => {
    if (email && pass && !processing) handleEmailAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, pass]);

  // URL params (session expired, confirmation)
  useEffect(() => {
    if (searchParams.get("sessionExpired") === "1") {
      showToast(t("sessionExpired"), "secondary");
      searchParams.delete("sessionExpired");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("confirmed") === "true") {
      showToast(t("emailConfirmed"), "success");
      searchParams.delete("confirmed");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, t]);

  // ---- Render ---------------------------------------------------------------

  return (
    <Container className="Auth-body-wrapper" fluid>
      {loading && (
        <Container className="Auth-body-wrapper" fluid>
          <LoadingPage type="ring" fullscreen={true} />
        </Container>
      )}

      {!loading &&
        (!searchParams.get("confirmed") ||
          !searchParams.get("confirmed") === "false") && (
          <Container className="Auth-container-wrapper" fluid>
            <Container className="Auth-container">
              <Image
                className="Auth-logo"
                src="./icons/logo.png"
                alt="CAP logo"
              />

              <h2 className="Auth-title">
                {props.type === "create" ? t("signUpMsg") : t("loginMsg")}
              </h2>

              {!email && (
                <InputGroup className="Auth-input-email" size="md">
                  <InputGroup.Text className="Auth-input-label"></InputGroup.Text>
                  <Form.Control
                    id="Auth-input-text"
                    className="Auth-email-input"
                    aria-label="Enter valid e-mail"
                    placeholder={t("mailPlaceholder")}
                    onFocus={(e) => (e.target.placeholder = "")}
                    onBlur={(e) =>
                      (e.target.placeholder = t("mailPlaceholder"))
                    }
                    size="md"
                  />
                </InputGroup>
              )}

              {email && (
                <InputGroup className="Auth-input-email-entered" size="md">
                  <InputGroup.Text
                    className="Auth-input-label"
                    onClick={() => {
                      setEmail(null);
                      setPass(undefined);
                      setPasswordInput("");
                      setConfirmationError(false);
                    }}
                  />
                  <Form.Control
                    className="Auth-email-input"
                    placeholder={email}
                    readOnly
                    size="md"
                  />
                </InputGroup>
              )}

              {email && (
                <>
                  <InputGroup className="Auth-input-pass" size="md">
                    <InputGroup.Text
                      className="Auth-input-label Auth-password-eye"
                      style={{ cursor: "pointer" }}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <FontAwesomeIcon
                        icon={!showPassword ? faEyeSlash : faEye}
                      />
                    </InputGroup.Text>
                    <Form.Control
                      id="Auth-input-password-text"
                      className="Auth-password-input"
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      size="md"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setPass(passwordInput);
                        }
                      }}
                    />
                  </InputGroup>

                  <Form.Check
                    type="checkbox"
                    id="rememberMe"
                    label={t("keepMeLoggedIn")}
                    className="Auth-keep-logged-toggle"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                </>
              )}

              {email && props.type === "login" && !confirmationError && (
                <p className="Auth-alternative-link">{t("forgotPass")}</p>
              )}

              {!confirmationError && (
                <Button
                  className="Auth-input-button"
                  variant="dark"
                  size="md"
                  onClick={!processing ? handleAuthStep : null}
                  disabled={processing}
                >
                  {processing ? t("processingMail") : t("authNextStep")}
                </Button>
              )}

              {confirmationError && (
                <>
                  <p className="Auth-confirmation-warning">
                    {t("accountNotConfirmedMessage")}
                  </p>
                  <Button
                    className="Auth-input-button"
                    variant="dark"
                    size="md"
                    onClick={!resendLoading ? handleResendConfirmation : null}
                    disabled={resendLoading}
                  >
                    {resendLoading ? t("resending") : t("resendConfirmation")}
                  </Button>
                </>
              )}

              <p>
                {props.type === "login"
                  ? reactStringReplace(
                      t("signUpAlternativeMsg"),
                      "{}",
                      (_m, i) => (
                        <NavLink
                          key={`signup-alt-${i}`}
                          className="Auth-alternative-link"
                          to="/signup"
                        >
                          {t("signUpButton")}
                        </NavLink>
                      ),
                    )
                  : reactStringReplace(
                      t("loginAlternativeMsg"),
                      "{}",
                      (_m, i) => (
                        <NavLink
                          key={`login-alt-${i}`}
                          className="Auth-alternative-link"
                          to="/login"
                        >
                          {t("loginButton")}
                        </NavLink>
                      ),
                    )}
              </p>

              <div className="Auth-divider">
                <span className="Auth-divider-or">{t("signUpOR")}</span>
              </div>

              {/* Google OAuth Button (redirect flow) */}
              <Button
                id="Auth-oauth-google"
                className="Auth-oauth-button"
                variant="outline-secondary"
                size="md"
                onClick={() => {
                  // This is a full-page redirect; popup logic is intentionally removed.
                  window.location.assign(buildGoogleImplicitUrl());
                }}
              >
                <img
                  src="/icons/g.png"
                  alt="Google authentication"
                  className="Auth-oauth-logo"
                />
                {t("loginWithGoogle")}
              </Button>

              {/* Cardano Wallet Login */}
              <Suspense
                fallback={
                  <LoadingPage
                    type="ring"
                    fullscreen={true}
                    message={t("loading.wallet")}
                  />
                }
              >
                <CardanoWalletLogin
                  onLogin={handleLogin}
                  showToast={showToast}
                />
              </Suspense>
            </Container>
          </Container>
        )}

      {/* "Check your email" confirmation view */}
      {searchParams.get("confirmed") === "false" && (
        <Container className="Auth-container confirm-message-box">
          <Image className="Auth-logo" src="./icons/logo.png" alt="CAP logo" />
          <h2 className="Auth-title">{t("confirmYourEmailTitle")}</h2>
          <p className="Auth-confirm-text">{t("confirmYourEmailMsg")}</p>
          <p className="Auth-confirm-text">{t("confirmDidNotReceive")}</p>
          <Button
            className="Auth-input-button"
            variant="dark"
            size="md"
            onClick={!resendLoading ? handleResendConfirmation : null}
            disabled={resendLoading}
          >
            {resendLoading ? t("resending") : t("resendConfirmation")}
          </Button>
        </Container>
      )}
    </Container>
  );
}

export default AuthPage;
