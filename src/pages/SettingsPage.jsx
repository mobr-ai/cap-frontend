// src/pages/SettingsPage.jsx
import React, { useState, useEffect, useRef } from "react";
import "../styles/SettingsPage.css";
import ShareModal from "../components/ShareModal";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  Container,
  Form,
  Row,
  Col,
  Image,
  Button,
  Spinner,
} from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShareAlt,
  faCopy,
  faPen,
  faUpload,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import { useAuthRequest } from "../hooks/useAuthRequest";
import { useLocalUpload } from "../hooks/useLocalUpload";
import { resizeImage } from "../utils/resizeImage";
import useOnClickOutside from "../hooks/useOnClickOutside";
import avatarImg from "/icons/avatar.png";

const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._]{5,29}$/;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const outlet = useOutletContext() || {};
  const { user, setUser, showToast } = outlet;

  // IMPORTANT: do NOT pass the raw user into useAuthRequest (it can clobber session).
  const { authFetch, authRequest } = useAuthRequest({
    session: outlet.session,
    showToast,
  });
  const { handleUploads } = useLocalUpload();

  const [language, setLanguage] = useState(i18n.language.split("-")[0] || "en");
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [newUsername, setNewUsername] = useState(user ? user.username : "");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const usernameRef = useRef(null);

  useOnClickOutside(usernameRef, () => {
    if (editingUsername) {
      if (newUsername && newUsername !== user.username) {
        handleUsernameSubmit();
      }
      setEditingUsername(false);
    }
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!user || !user.id || !outlet?.session?.access_token) navigate("/login");
  }, [user, outlet?.session, navigate]);

  // ---- Helpers -------------------------------------------------------------

  // Local-only settings updater (no extra POST to /user/{id})
  async function saveSettingsLocally(updated) {
    const current = safeParse(user?.settings) || {};
    const merged = { ...current, ...updated };

    setUser((prev) => ({
      ...prev,
      settings: JSON.stringify(merged),
      // mirror common top-level fields for convenience in UI
      avatar: updated.avatar ?? prev.avatar,
      username: updated.username ?? prev.username,
    }));

    showToast?.(t("settingsSaved"), "success");
  }

  function safeParse(json) {
    try {
      return json ? JSON.parse(json) : {};
    } catch {
      return {};
    }
  }

  // ---- Avatar flow ---------------------------------------------------------
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSavingAvatar(true);

      // resize on client (optional utility you already have)
      const resized = await resizeImage(file); // e.g., 512x512 @ ~85%

      // upload to /user/{id}/avatar (already persists server-side)
      const uploadResult = await handleUploads([resized]);
      const avatarUrl = uploadResult?.[0]?.url;
      if (!avatarUrl) throw new Error("No upload URL returned");

      // Update UI state only; no extra POST to /user/{id}
      await saveSettingsLocally({ avatar: avatarUrl });
    } catch (err) {
      console.error(err);
      showToast?.(t("avatarUpdateFailed"), "danger");
    } finally {
      setIsSavingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  // ---- Language ------------------------------------------------------------
  const handleLanguageChange = (e) => {
    const selected = e.target.value;
    setLanguage(selected);
    localStorage.setItem("i18nextLng", selected);
    i18n.changeLanguage(selected);
  };

  // ---- Username flow -------------------------------------------------------
  const handleUsernameSubmit = async () => {
    if (!newUsername || newUsername === user.username) return;

    const trimmed = newUsername.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      showToast?.(t("invalidUsername"), "danger");
      return;
    }

    setIsSavingUsername(true);
    try {
      // Optional: server-side username availability check
      const res = await authRequest
        .post("/api/validate_username")
        .send({ username: trimmed });

      if (res?.body && res.body.available === false) {
        showToast?.(t("usernameTaken"), "danger");
        return;
      }

      // Apply locally; if/when you add a proper PATCH endpoint, call it here.
      await saveSettingsLocally({ username: trimmed });
    } catch (e) {
      console.error(e);
      showToast?.(t("settingsFailed"), "danger");
    } finally {
      setIsSavingUsername(false);
      setEditingUsername(false);
    }
  };

  // ---- Danger zone ---------------------------------------------------------
  const deleteAccount = async () => {
    if (!window.confirm(t("confirmAccountDeletion"))) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/user/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        localStorage.clear();
        setUser(null);
        navigate("/login");
      } else {
        showToast?.(t("accountDeletionFailed"), "danger");
      }
    } catch {
      showToast?.(t("accountDeletionFailed"), "danger");
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Referral utils ------------------------------------------------------
  const encodeBase62 = (num) => {
    const ALPH =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (num === 0) return ALPH[0];
    let out = "",
      n = num;
    while (n > 0) {
      out = ALPH[n % 62] + out;
      n = Math.floor(n / 62);
    }
    return out;
  };

  const referralBase = `${window.location.origin}/signup?ref=`;
  const generateReferralLink = (userId) =>
    `${referralBase}${encodeBase62(Number(userId) || 0)}`;

  const copyReferralMessage = async () => {
    const link = generateReferralLink(user.id);
    const message = `${t("shareMessageIntro")}\n\n${link}\n\n${t(
      "shareMessageOutro"
    )}`;
    try {
      await navigator.clipboard.writeText(message);
      showToast?.(t("copiedToClipboard"), "success");
    } catch {
      showToast?.(t("copyFailed"), "danger");
    }
  };

  if (!user) return null;

  // ---- UI ------------------------------------------------------------------
  return (
    <div className="Settings-body">
      <Container className="Settings-container">
        <h2 className="Settings-title">{t("settings")}</h2>

        <div className="Settings-user-box">
          <Row className="align-items-center">
            <Col xs={4}>
              <div
                className="Settings-avatar-wrapper"
                onMouseEnter={() => setEditingAvatar(true)}
                onMouseLeave={() => setEditingAvatar(false)}
                onClick={() => avatarInputRef.current?.click()}
              >
                <Image
                  src={user.avatar || avatarImg}
                  alt="Avatar"
                  className="Settings-avatar-img"
                  onError={(e) => (e.currentTarget.src = avatarImg)}
                  roundedCircle
                  fluid
                />
                {isSavingAvatar ? (
                  <Spinner
                    animation="border"
                    size="sm"
                    className="Settings-avatar-icon"
                  />
                ) : (
                  editingAvatar && (
                    <FontAwesomeIcon
                      icon={faUpload}
                      className="Settings-avatar-icon"
                    />
                  )
                )}
                <input
                  type="file"
                  ref={avatarInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </div>
            </Col>

            <Col xs={8}>
              <h5>
                <div
                  className="Settings-username-wrapper"
                  onClick={() => setEditingUsername(true)}
                  ref={usernameRef}
                >
                  {editingUsername ? (
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          newUsername !== user.username
                        ) {
                          handleUsernameSubmit();
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <div style={{ cursor: "pointer" }}>
                      {user.username ||
                        user.display_name ||
                        `CAP User${user.id}`}
                      {isSavingUsername ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <FontAwesomeIcon
                          icon={faPen}
                          className="Settings-username-icon"
                        />
                      )}
                    </div>
                  )}
                </div>
              </h5>

              <p className="Settings-username-wallet mb-1">
                {user.email || user.display_name || ""}
              </p>

              <small className="Settings-referral-row">
                {t("referralLink")}:
                <div>
                  <a
                    href={generateReferralLink(user.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="Settings-referral-link"
                  >
                    {generateReferralLink(user.id)}
                  </a>
                </div>
                <div className="Settings-referral-buttons">
                  <Button
                    size="sm"
                    variant="outline-light"
                    onClick={copyReferralMessage}
                  >
                    <FontAwesomeIcon icon={faCopy} className="Settings-icon" />
                    {t("copy")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-light"
                    onClick={() => setShowShareModal(true)}
                  >
                    <FontAwesomeIcon
                      icon={faShareAlt}
                      className="Settings-icon"
                    />
                    {t("share")}
                  </Button>
                </div>
              </small>
            </Col>
          </Row>
        </div>

        <Form onSubmit={(e) => e.preventDefault()}>
          <Form.Group controlId="languageSelect" className="mb-3">
            <Form.Label>{t("languageConf")}</Form.Label>
            <Form.Select value={language} onChange={handleLanguageChange}>
              <option value="en">🇺🇸 English (US)</option>
              <option value="pt">🇧🇷 Português (BR)</option>
            </Form.Select>
          </Form.Group>
        </Form>

        <div
          className="mt-4 p-3"
          style={{ backgroundColor: "#59454d", borderRadius: 6 }}
        >
          <h5 className="text-danger">{t("dangerZone")}</h5>
          <Button
            variant="danger"
            onClick={deleteAccount}
            disabled={isDeleting}
          >
            <FontAwesomeIcon icon={faTrash} className="me-2" />
            {isDeleting ? t("deleting") : t("deleteAccount")}
          </Button>
        </div>
      </Container>

      <ShareModal
        show={showShareModal}
        onHide={() => setShowShareModal(false)}
        title={t("shareMessageIntro")}
        hashtags={t("shareMessageOutro")
          .split(/\s+/)
          .map((tag) => tag.replace(/^#/, ""))}
        link={generateReferralLink(user.id)}
        message={`${t("shareMessageIntro")}\n\n${generateReferralLink(
          user.id
        )}\n\n${t("shareMessageOutro")}`}
      />
    </div>
  );
}
