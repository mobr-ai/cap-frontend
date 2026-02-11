// src/components/admin/QueryDetailsModal.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuthRequest } from "@/hooks/useAuthRequest";

function fmtMs(v) {
  const n = Number(v || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function normalizeSparql(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function fmtBool(t, v) {
  if (v === true) return t("common.yes");
  if (v === false) return t("common.no");
  return "—";
}

export default function QueryDetailsModal({
  t,
  queryId,
  initialData,
  onClose,
}) {
  const navigate = useNavigate();
  const { session, showToast, handleLogout } = useOutletContext() || {};
  const { authFetch } = useAuthRequest({ session, showToast, handleLogout });

  const [tab, setTab] = useState("nl"); // "nl" | "sparql"
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState("");

  const lastIdRef = useRef(null);

  const load = useCallback(async () => {
    if (!queryId) return;

    setLoading(true);
    setError("");

    try {
      const res = await authFetch(`/api/v1/metrics/queries/${queryId}`, {
        method: "GET",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      setData(payload);
    } catch (e) {
      setError(String(e?.message || e));
      setData(initialData || null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, initialData, queryId]);

  useEffect(() => {
    if (!queryId) return;
    if (lastIdRef.current === queryId) return;
    lastIdRef.current = queryId;

    setTab("nl");

    if (initialData) {
      setData(initialData);
      setLoading(false);
      setError("");
      return;
    }

    load();
  }, [queryId, initialData, load]);

  const sparql = useMemo(() => normalizeSparql(data?.sparql_query), [data]);
  const canOpenConversation = !!data?.conversation_id;

  const openConversation = () => {
    if (!canOpenConversation) return;
    navigate(`/admin/conversations/${data.conversation_id}`, {
      state: {
        readOnly: true,
        initialScrollMessageId:
          data.conversation_message_id != null
            ? String(data.conversation_message_id)
            : null,
      },
    });
  };

  const [isClosing, setIsClosing] = useState(false);

  const requestClose = useCallback(() => {
    setIsClosing(true);
    window.setTimeout(() => {
      onClose?.();
    }, 140);
  }, [onClose]);

  return (
    <div
      className={`uq-modal-backdrop ${isClosing ? "uq-modal-backdrop--closing" : ""}`}
      onClick={requestClose}
    >
      <div
        className={`uq-modal ${isClosing ? "uq-modal--closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="uq-modal-header">
          <h3>{t("admin.queryDetails.title")}</h3>
          <button
            className="uq-modal-close"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>

        {/* Tab Card (tabs + panel) */}
        <div className="uq-tabcard">
          <div className="uq-tabbar">
            <button
              type="button"
              className={`uq-tab ${tab === "nl" ? "active" : ""}`}
              onClick={() => setTab("nl")}
            >
              {t("admin.queryDetails.tabNl")}
            </button>

            <button
              type="button"
              className={`uq-tab ${tab === "sparql" ? "active" : ""}`}
              onClick={() => setTab("sparql")}
            >
              {t("admin.queryDetails.tabSparql")}
            </button>

            <div className="uq-tabs-spacer" />

            <button
              type="button"
              className="btn btn-outline-light btn-sm uq-open-convo-btn"
              disabled={!canOpenConversation}
              onClick={openConversation}
              title={
                canOpenConversation
                  ? t("admin.queryDetails.openConversation")
                  : t("admin.queryDetails.openConversationUnavailable")
              }
            >
              {t("admin.queryDetails.openConversation")}
            </button>
          </div>

          <div className="uq-tabpanel">
            {error ? <div className="uq-modal-error">{error}</div> : null}

            {loading ? (
              <div
                className="analyses-loading"
                style={{ padding: "0.75rem 0" }}
              >
                {t("analyses.loading")}
              </div>
            ) : null}

            {!loading && tab === "nl" && (
              <section className="uq-modal-section">
                <label>{t("admin.queryDetails.query")}</label>
                <pre className="uq-modal-query">{data?.nl_query || "—"}</pre>
              </section>
            )}

            {!loading && tab === "sparql" && (
              <section className="uq-modal-section">
                <label>{t("admin.queryDetails.sparql")}</label>
                <pre className="uq-modal-code">
                  <code>{sparql || "—"}</code>
                </pre>
              </section>
            )}
          </div>
        </div>

        {!loading && (
          <section className="uq-modal-grid">
            <div>
              <strong>ID</strong> #{data?.id}
            </div>
            <div>
              <strong>{t("admin.userQueries.language")}</strong>{" "}
              {data?.language || "—"}
            </div>
            <div>
              <strong>{t("admin.queryDetails.userId")}</strong>{" "}
              {data?.user_id ?? "—"}
            </div>

            <div>
              <strong>{t("admin.queryDetails.createdAt")}</strong>{" "}
              {fmtWhen(data?.created_at)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.complexity")}</strong>{" "}
              {data?.complexity_score ?? 0}
            </div>

            <div>
              <strong>{t("admin.queryDetails.sparqlValid")}</strong>{" "}
              {fmtBool(t, data?.sparql_valid)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.semanticValid")}</strong>{" "}
              {fmtBool(t, data?.semantic_valid)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.federated")}</strong>{" "}
              {fmtBool(t, data?.is_federated)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.sequential")}</strong>{" "}
              {fmtBool(t, data?.is_sequential)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.temporal")}</strong>{" "}
              {fmtBool(t, data?.has_temporal)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.offchainMetadata")}</strong>{" "}
              {fmtBool(t, data?.has_offchain_metadata)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.aggregation")}</strong>{" "}
              {fmtBool(t, data?.has_aggregation)}
            </div>

            <div>
              <strong>{t("admin.queryDetails.multiRel")}</strong>{" "}
              {fmtBool(t, data?.has_multi_relationship)}
            </div>

            <div>
              <strong>{t("admin.userQueries.totalLatency")}</strong>{" "}
              {fmtMs(data?.total_latency_ms)}
            </div>
            <div>
              <strong>LLM</strong> {fmtMs(data?.llm_latency_ms)}
            </div>
            <div>
              <strong>SPARQL</strong> {fmtMs(data?.sparql_latency_ms)}
            </div>
            <div>
              <strong>{t("admin.userQueries.resultType")}</strong>{" "}
              {data?.result_type || "—"}
            </div>
            <div>
              <strong>{t("admin.userQueries.results")}</strong>{" "}
              {data?.result_count ?? 0}
            </div>
            <div>
              <strong>{t("admin.userQueries.succeeded")}</strong>{" "}
              {data?.succeeded ? t("common.yes") : t("common.no")}
            </div>
          </section>
        )}
        {!loading && data?.error_message ? (
          <div className="uq-modal-error" style={{ marginTop: "0.75rem" }}>
            {data.error_message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
