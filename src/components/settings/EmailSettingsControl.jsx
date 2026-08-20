import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";


function getCopy(language) {
  if (
    String(language || "")
      .toLowerCase()
      .startsWith("pt")
  ) {
    return {
      none: "Nenhum e-mail adicionado",
      add: "Adicionar e-mail",
      change: "Alterar",
      placeholder: "voce@exemplo.com",
      send: "Enviar verificação",
      sending: "Enviando…",
      cancel: "Cancelar",
      sent:
        "Enviamos um link de verificação. Abra seu e-mail para concluir.",
      confirmed: "E-mail verificado com sucesso.",
      conflict:
        "Este e-mail já está associado a outra conta CAP.",
      failed:
        "Não foi possível enviar o e-mail de verificação.",
    };
  }

  return {
    none: "No email added",
    add: "Add email",
    change: "Change",
    placeholder: "you@example.com",
    send: "Send verification",
    sending: "Sending…",
    cancel: "Cancel",
    sent:
      "Verification link sent. Open your email to complete verification.",
    confirmed: "Email verified successfully.",
    conflict:
      "That email is already associated with another CAP account.",
    failed:
      "We couldn’t send the verification email.",
  };
}


export default function EmailSettingsControl({
  user,
  session,
  setUser,
  showToast,
}) {
  const { i18n } = useTranslation();

  const copy = useMemo(
    () => getCopy(
      i18n?.resolvedLanguage
      || i18n?.language
      || "en"
    ),
    [
      i18n?.resolvedLanguage,
      i18n?.language,
    ],
  );

  const currentEmail = user?.email || "";
  const canManageEmail = Boolean(
    user?.wallet_address
  );

  const [editing, setEditing] = useState(false);
  const [inputEmail, setInputEmail] = useState(
    currentEmail
  );
  const [pendingEmail, setPendingEmail] =
    useState("");
  const [sending, setSending] = useState(false);

  const accessToken = session?.access_token || "";

  useEffect(() => {
    setInputEmail(currentEmail);
  }, [currentEmail]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function refreshCanonicalEmail() {
      try {
        const response = await fetch(
          "/api/v1/user/email/status",
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
              "X-Requested-With":
                "XMLHttpRequest",
            },
          },
        );

        if (!response.ok) return;

        const data = await response.json();

        if (cancelled) return;

        const canonicalEmail =
          data?.email || "";

        setUser?.((previous) => ({
          ...previous,
          email: canonicalEmail || null,
        }));
      } catch {
        // Existing session state remains usable.
      }
    }

    refreshCanonicalEmail();

    const params = new URLSearchParams(
      window.location.search
    );

    if (
      params.get("emailConfirmed")
      === "true"
    ) {
      showToast?.(
        copy.confirmed,
        "success"
      );

      params.delete("emailConfirmed");

      const query = params.toString();

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
          + (query ? `?${query}` : "")
          + window.location.hash,
      );
    }

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    copy.confirmed,
    setUser,
    showToast,
  ]);

  async function submit(event) {
    event.preventDefault();

    const normalized = (
      inputEmail || ""
    ).trim().toLowerCase();

    if (!normalized || !accessToken) {
      return;
    }

    setSending(true);

    try {
      const response = await fetch(
        "/api/v1/user/email/verification",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${accessToken}`,
            "X-Requested-With":
              "XMLHttpRequest",
          },
          body: JSON.stringify({
            email: normalized,
            language: (
              i18n?.resolvedLanguage
              || i18n?.language
              || "en"
            ).split("-")[0],
          }),
        },
      );

      let data = {};

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        if (
          data?.detail
          === "emailAlreadyInUse"
        ) {
          showToast?.(
            copy.conflict,
            "danger"
          );
          return;
        }

        throw new Error(
          data?.detail
          || "emailVerificationFailed"
        );
      }

      if (
        data?.status
        === "already_verified"
      ) {
        setEditing(false);
        setPendingEmail("");
        return;
      }

      setPendingEmail(
        data?.email || normalized
      );
      setEditing(false);

      showToast?.(
        copy.sent,
        "success"
      );
    } catch (error) {
      console.error(
        "[Settings] Email verification failed:",
        error,
      );

      showToast?.(
        copy.failed,
        "danger"
      );
    } finally {
      setSending(false);
    }
  }

  // Non-wallet identities keep the existing read-only email behavior.
  if (!canManageEmail) {
    return (
      <p className="Settings-username-wallet mb-1">
        {currentEmail}
      </p>
    );
  }

  return (
    <div className="mb-2">
      <div
        className={
          "d-flex align-items-center "
          + "gap-2 flex-wrap"
        }
      >
        <span className="Settings-username-wallet">
          {currentEmail || copy.none}
        </span>

        {!editing ? (
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={() => {
              setInputEmail(currentEmail);
              setEditing(true);
            }}
          >
            {currentEmail
              ? copy.change
              : copy.add}
          </button>
        ) : null}
      </div>

      {pendingEmail ? (
        <div className="small text-secondary mt-1">
          {pendingEmail}: {copy.sent}
        </div>
      ) : null}

      {editing ? (
        <form
          className={
            "d-flex gap-2 mt-2 flex-wrap"
          }
          onSubmit={submit}
        >
          <input
            type="email"
            required
            autoComplete="email"
            className={
              "form-control form-control-sm"
            }
            style={{ maxWidth: 360 }}
            value={inputEmail}
            placeholder={copy.placeholder}
            disabled={sending}
            onChange={(event) => {
              setInputEmail(
                event.target.value
              );
            }}
          />

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={
              sending
              || !inputEmail.trim()
            }
          >
            {sending
              ? copy.sending
              : copy.send}
          </button>

          <button
            type="button"
            className={
              "btn btn-outline-secondary btn-sm"
            }
            disabled={sending}
            onClick={() => {
              setEditing(false);
              setInputEmail(
                currentEmail
              );
            }}
          >
            {copy.cancel}
          </button>
        </form>
      ) : null}
    </div>
  );
}
