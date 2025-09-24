// src/WaitingListPage.jsx
import React, { useState } from "react";
import "../styles/WaitingListPage.css";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import i18n from "../i18n";

/**
 * WaitingListPage (CAP)
 * - Minimal signup page that posts to /wait_list
 * - Accepts optional ?ref=u123 and forwards language code
 * - Handles success (201), already-on-list (418), and generic errors

 */
const WaitingList = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(undefined); // true | false | null (null = already)
  const [searchParams] = useSearchParams();
  const [ref] = useState(searchParams.get("ref") || "");
  const { t } = useTranslation();

  const reqSuccess = () => {
    setSubmitted(true);
    setSuccess(true);
  };

  const reqAlready = () => {
    setSubmitted(true);
    setSuccess(null);
  };

  const reqError = () => {
    setSubmitted(true);
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/wait_list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          email,
          ref,
          language: (i18n.language || "en").split("-")[0],
        }),
      });

      if (res.status === 201 || res.status === 200) return reqSuccess();
      if (res.status === 418) return reqAlready();
      return reqError();
    } catch {
      return reqError();
    }
  };

  const handleInputChange = (e) => {
    const input = e.target.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // allow empty (to clear) or valid email
    if (emailRegex.test(input) || input === "") {
      setEmail(input);
    } else {
      setEmail(input); // let browser's required/email type handle final validation
    }
  };

  return (
    <div className="WaitingList-body">
      <div className="WaitingList-middle-column">
        {!submitted ? (
          <div className="logo-wrap">
            <img
              src="/icons/logo.svg"
              className="WaitingList-logo"
              alt="CAP Logo"
            />
          </div>
        ) : (
          <div className="logo-wrap">
            <img
              src="/icons/logo.svg"
              className="WaitingList-logo-static"
              alt="CAP Logo"
            />
          </div>
        )}

        <h1 className="text-3xl font-semibold">{t("joinWaitList")}</h1>
        <p className="mt-2 text-gray-400">{t("joinWaitListSubtitle")}</p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="WaitingList-input-form WaitingList-logo-text"
          >
            <input
              type="email"
              value={email}
              onChange={handleInputChange}
              placeholder={t("enterEmailPlaceholder")}
              className="WaitingList-input"
              required
            />
            <button
              type="submit"
              className="btn btn-secondary btn-lg WaitingList-btn"
            >
              {t("signUpButton")}
            </button>
          </form>
        ) : success === true ? (
          <p className="mt-4">{t("successWaitListMsg")}</p>
        ) : success === false ? (
          <p className="mt-4">{t("errorWaitListMsg")}</p>
        ) : (
          <p className="mt-4">{t("alreadyOnWaitListMsg")}</p>
        )}
      </div>
    </div>
  );
};

export default WaitingList;
