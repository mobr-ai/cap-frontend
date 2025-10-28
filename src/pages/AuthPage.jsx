// src/pages/AuthPage.jsx
import i18n from "../i18n";
import { useState, useEffect, useCallback, Suspense } from "react";
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
import { useGoogleLogin } from "@react-oauth/google";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import "../styles/AuthPage.css";
import CardanoWalletLogin from "../components/wallet/CardanoWalletLogin";
import LoadingPage from "./LoadingPage";

/**
 * AuthPage (CAP)
 * - Supports login and signup (props.type = "login" | "create")
 * - Email/password (with confirmation flow + resend)
 * - Google OAuth 2 + One Tap (via @react-oauth/google and google.accounts.id)
 * - Cardano wallet login (CIP-30) via <CardanoWalletLogin/>
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

  // ---- Helpers --------------------------------------------------------------

  const currentLang = () =>
    i18n.language?.split("-")[0] ||
    window.localStorage.i18nextLng?.split("-")[0] ||
    "en";

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
        const errKey = errorData?.detail || errorData?.error || "loginError";
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
      const key = error?.message || "loginError";
      showToast(t(key), "danger");
    } finally {
      setProcessing(false);
    }
  };

  // ---- Google OAuth / One Tap -----------------------------------------------

  const handleGoogleResponse = async (tokenResponse, onSuccess) => {
    try {
      setLoading(true);

      const token =
        tokenResponse?.access_token || tokenResponse?.credential || null;
      const tokenType = tokenResponse?.access_token
        ? "access_token"
        : "id_token";

      if (!token) {
        throw new Error("missingGoogleToken");
      }

      const res = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          token_type: tokenType,
          remember_me: true,
        }),
      });

      if (!res.ok) {
        let errMsg = "googleAuthFailed";
        try {
          const err = await res.json();
          errMsg = err?.detail || err?.error || errMsg;
        } catch {
          /* ignore JSON parse errors */
        }
        throw new Error(errMsg);
      }

      let apiResponse = {};
      try {
        apiResponse = await res.json();
      } catch {
        throw new Error("invalidApiResponse");
      }

      if (!apiResponse?.access_token) {
        throw new Error("invalidApiResponse");
      }

      onSuccess?.(apiResponse);
    } catch (err) {
      console.error("Authentication Error:", err);
      showToast(t(err?.message || "googleAuthFailed"), "danger");
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = useGoogleLogin({
    scope: "openid email profile",
    flow: "implicit",
    onSuccess: (tokenResponse) => {
      console.log("Google OAuth success", tokenResponse);
      handleGoogleResponse(tokenResponse, handleLogin);
    },
    onError: (error) => {
      console.error("Google OAuth error", error);
      showToast(t("googleAuthFailed"), "danger");
    },
  });

  // ---- Optional: initialize Google One Tap ----------------------------------
  useEffect(() => {
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: (tokenResponse) =>
            handleGoogleResponse(tokenResponse, handleLogin),
        });
        // show One Tap popup automatically
        window.google.accounts.id.prompt();
      } catch (e) {
        console.warn("Google One Tap init failed:", e);
      }
    }
  }, []);

  // ---- Email "two-step" UX --------------------------------------------------

  const handleAuthStep = useCallback(() => {
    if (!email) {
      const el = document.getElementById("Auth-input-text");
      const value = el?.value?.trim();
      if (value) setEmail(value);
      return;
    }
    if (email && !pass) {
      if (passwordInput?.length > 0) setPass(passwordInput);
      return;
    }
    if (email && pass && !processing) {
      handleEmailAuth();
    }
  }, [email, pass, passwordInput, processing]);

  // Auto-submit when both email+pass are set by "Enter"
  useEffect(() => {
    if (email && pass && !processing) {
      handleEmailAuth();
    }
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
          <LoadingPage />
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

              {/* Step 1: email */}
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

              {/* Step 1.5: entered email */}
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

              {/* Step 2: password */}
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

              {/* CTA */}
              <>
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
              </>

              {/* Switch login/signup */}
              <p>
                {props.type === "login"
                  ? reactStringReplace(
                      t("signUpAlternativeMsg"),
                      "{}",
                      (_match, i) => (
                        <NavLink
                          key={`signup-alt-${i}`}
                          className="Auth-alternative-link"
                          to="/signup"
                        >
                          {t("signUpButton")}
                        </NavLink>
                      )
                    )
                  : reactStringReplace(
                      t("loginAlternativeMsg"),
                      "{}",
                      (_match, i) => (
                        <NavLink
                          key={`login-alt-${i}`}
                          className="Auth-alternative-link"
                          to="/login"
                        >
                          {t("loginButton")}
                        </NavLink>
                      )
                    )}
              </p>

              {/* Divider */}
              <div className="Auth-divider">
                <span className="Auth-divider-or">{t("signUpOR")}</span>
              </div>

              {/* Google OAuth Button */}
              <Button
                id="Auth-oauth-google"
                className="Auth-oauth-button"
                variant="outline-secondary"
                size="md"
                onClick={() => {
                  setLoading(true);
                  loginWithGoogle();
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
              <Suspense fallback={<LoadingPage type="simple" />}>
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
