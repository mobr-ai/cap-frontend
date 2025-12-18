// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import { useLLMStream } from "@/hooks/useLLMStream";
import { sanitizeChunk, finalizeForRender } from "@/utils/streamSanitizers";
import { kvToChartSpec } from "@/utils/kvCharts";
import VegaChart from "@/components/artifacts/VegaChart";
import KVTable, { isValidKVTable } from "@/components/artifacts/KVTable";

import "@/styles/LandingPage.css";

const artifactsKey = (id) => `cap.convArtifacts.${id}`;

function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

function hashArtifact(a) {
  // Stable stringify (order matters)
  const payload = JSON.stringify({
    type: a.type,
    kvType: a.kvType,
    vegaSpec: a.vegaSpec || null,
    rows: Array.isArray(a.rows) ? a.rows.length : null,
    cols: Array.isArray(a.columns) ? a.columns.length : null,
  });

  // Modern, safe base64 encoding
  return btoa(
    new TextEncoder()
      .encode(payload)
      .reduce((s, b) => s + String.fromCharCode(b), "")
  );
}

function artifactToMessage(a) {
  if (!a || !a.id || !a.artifact_type || !a.config) return null;

  const id = `artifact_${a.id}`;

  if (a.artifact_type === "table") {
    const kv = a.config?.kv;
    if (!kv) return null;
    return { id, type: "table", content: "", kv, persisted: true };
  }

  if (a.artifact_type === "chart") {
    // backend can store either vegaSpec or kv (depending on your persistence impl)
    const vegaSpec = a.config?.vegaSpec;
    const kvType = a.config?.kvType || a.kv_type || null;

    if (vegaSpec) {
      return {
        id,
        type: "chart",
        content: "",
        vegaSpec,
        kvType,
        persisted: true,
      };
    }

    // If you ever store chart as kv instead of vegaSpec, you can re-hydrate spec:
    const kv = a.config?.kv;
    if (kv) {
      const spec = kvToChartSpec(kv);
      if (!spec) return null;
      return {
        id,
        type: "chart",
        content: "",
        vegaSpec: spec,
        kvType: kvType || kv.result_type,
        persisted: true,
      };
    }

    return null;
  }

  return null;
}

function mergeById(prev, next) {
  const map = new Map();
  (prev || []).forEach((m) => map.set(m.id, m));
  (next || []).forEach((m) => map.set(m.id, m));
  return Array.from(map.values());
}

function injectArtifactsAfterMessage(restoredMsgs, artifacts) {
  const msgs = Array.isArray(restoredMsgs) ? restoredMsgs.slice() : [];
  const arts = Array.isArray(artifacts) ? artifacts : [];
  if (!arts.length) return msgs;

  // Convert artifacts to message objects
  const artifactMsgs = arts
    .map((a) => ({ raw: a, msg: artifactToMessage(a) }))
    .filter((x) => x.msg);

  if (!artifactMsgs.length) return msgs;

  // Build quick lookup: conversation_message_id -> artifacts[]
  const byMsgId = new Map();
  for (const { raw, msg } of artifactMsgs) {
    const key = raw.conversation_message_id || null;
    if (!byMsgId.has(key)) byMsgId.set(key, []);
    byMsgId.get(key).push(msg);
  }

  // Insert right after the linked message; if not found, append at end.
  const out = [];
  const inserted = new Set();

  for (const m of msgs) {
    out.push(m);

    // restored message ids are conv_<id>
    const convMsgId =
      typeof m.id === "string" && m.id.startsWith("conv_")
        ? Number(m.id.slice(5))
        : null;

    if (convMsgId && byMsgId.has(convMsgId)) {
      for (const am of byMsgId.get(convMsgId)) {
        out.push(am);
        inserted.add(am.id);
      }
    }
  }

  // Append any remaining artifacts that weren’t inserted
  for (const { msg } of artifactMsgs) {
    if (!inserted.has(msg.id)) out.push(msg);
  }

  return out;
}

function appendChunkSmart(prev, chunk) {
  if (!chunk) return prev || "";
  if (!prev) return chunk;

  const lastChar = prev[prev.length - 1];
  const firstChar = chunk[0];

  const isLetter = (ch) => /[A-Za-z]/.test(ch || "");
  const isDigit = (ch) => /[0-9]/.test(ch || "");

  if (/^\s/.test(chunk)) return prev + chunk;
  if (/\s/.test(lastChar)) return prev + chunk;

  if (/[.!?]/.test(lastChar) && isLetter(firstChar)) {
    return prev + " " + chunk;
  }

  if (isLetter(lastChar) && isDigit(firstChar)) {
    const tail = prev.slice(-6).toLowerCase();
    if (
      tail.endsWith("addr") ||
      tail.endsWith("stake") ||
      tail.endsWith("pool")
    ) {
      return prev + chunk;
    }
    return prev + " " + chunk;
  }

  if (isDigit(lastChar) && isLetter(firstChar)) {
    return prev + " " + chunk;
  }

  return prev + chunk;
}

function normalizeKvResultType(rt) {
  const s = String(rt || "")
    .trim()
    .toLowerCase();
  if (!s) return s;

  if (s === "pie_chart") return "pie";
  if (s === "bar_chart") return "bar";
  if (s === "line_chart") return "line";

  return s.replace(/_chart$/, "");
}

export default function LandingPage() {
  const NL_ENDPOINT = import.meta.env.VITE_NL_ENDPOINT || "/api/v1/nl/query";

  const outlet = useOutletContext() || {};
  const { session, showToast } = outlet;

  const { authFetch } = useAuthRequest({ session, showToast });
  const authFetchRef = useRef(null);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams();
  const { t } = useTranslation();

  const [messages, setMessages] = useState([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const conversationMetaRef = useRef({
    conversationId: routeConversationId ? Number(routeConversationId) : null,
    userMessageId: null,
    emittedCreatedEvent: false,
  });

  const lastLoadedConversationIdRef = useRef(null);

  const [topQueries, setTopQueries] = useState([
    { query: "List the latest 5 blocks." },
    { query: "Plot a bar chart showing monthly multi assets created in 2021." },
    {
      query:
        "Plot a line chart showing monthly number of transactions and outputs.",
    },
    {
      query:
        "Plot a pie chart to show how much the top 1% ADA holders represent from the total supply on the Cardano network.",
    },
  ]);

  const messagesEndRef = useRef(null);
  const statusMsgIdRef = useRef(null);

  // Keep ref in sync with route
  useEffect(() => {
    const id = routeConversationId;
    conversationMetaRef.current.conversationId = id ? Number(id) : null;
  }, [routeConversationId]);

  // Load conversation (IMPORTANT: do NOT depend on authFetch directly)
  useEffect(() => {
    const id = routeConversationId ? Number(routeConversationId) : null;
    const fetchFn = authFetchRef.current;

    if (!id || !fetchFn) {
      setMessages([]);
      setIsLoadingConversation(false);
      lastLoadedConversationIdRef.current = null;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setIsLoadingConversation(true);

    (async () => {
      try {
        const res = await fetchFn(`/api/v1/conversations/${id}`, {
          signal: controller.signal,
        });
        if (!res?.ok) throw new Error("Failed to load conversation");

        const data = await res.json();
        if (cancelled) return;

        const restoredMsgs = (data?.messages || []).map((m) => ({
          id: `conv_${m.id}`,
          type: m.role === "user" ? "user" : "assistant",
          content: m.content,
        }));

        const restoredWithArtifacts = injectArtifactsAfterMessage(
          restoredMsgs,
          data?.artifacts || []
        );

        const prevLoadedId = lastLoadedConversationIdRef.current;
        const isNewConversationRoute = prevLoadedId !== id;

        if (isNewConversationRoute) {
          // KEY: replace to avoid duplicates of live-streamed ephemeral messages
          setMessages(restoredWithArtifacts);
          lastLoadedConversationIdRef.current = id;
        } else {
          // if same route refresh, merge is fine
          setMessages((prev) => mergeById(prev, restoredWithArtifacts));
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "AbortError") return;

        console.error("Error loading conversation", err);
        showToast?.(t("landing.loadConversationError"), "danger");
      } finally {
        if (!cancelled) setIsLoadingConversation(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeConversationId, showToast, t]);

  // Stream session binding (prevents chunks being rendered into the wrong convo)
  const activeStreamRef = useRef({
    requestId: null,
    startedRouteConversationId: routeConversationId
      ? Number(routeConversationId)
      : null,
    resolvedConversationId: null, // set once we get x-conversation-id
  });

  const isViewingStreamConversation = useCallback(() => {
    const routeId = routeConversationId ? Number(routeConversationId) : null;
    const s = activeStreamRef.current;

    // If stream hasn’t resolved conv id yet, bind to the route where it started.
    const targetId =
      typeof s.resolvedConversationId === "number" &&
      !Number.isNaN(s.resolvedConversationId)
        ? s.resolvedConversationId
        : s.startedRouteConversationId;

    // “New conversation” route: allow updates only while user is still on "/"
    if (!routeId && !targetId) return true;

    return !!routeId && !!targetId && routeId === targetId;
  }, [routeConversationId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  const emitStreamEvent = useCallback((type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      // ignore
    }
  }, []);

  const addMessage = useCallback((type, content, extra = {}) => {
    const id =
      extra.id ||
      `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setMessages((prev) => [...prev, { id, type, content, ...extra }]);
    return id;
  }, []);

  const updateMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const removeMessage = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleStatus = useCallback(
    (text) => {
      if (!text) return;
      if (!isViewingStreamConversation()) return;

      if (!statusMsgIdRef.current) {
        statusMsgIdRef.current = addMessage("status", text);
      } else {
        updateMessage(statusMsgIdRef.current, { content: text });
      }
    },
    [isViewingStreamConversation, addMessage, updateMessage]
  );

  const handleChunk = useCallback(
    (raw) => {
      const chunk = sanitizeChunk(raw);
      if (!chunk) return;
      if (!isViewingStreamConversation()) return;

      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];

        if (last && last.type === "assistant" && last.streaming) {
          // IMPORTANT: don't mutate existing object in-place
          next[next.length - 1] = {
            ...last,
            content: appendChunkSmart(last.content || "", chunk),
          };
        } else {
          next.push({
            id: `assistant_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
            type: "assistant",
            content: chunk,
            streaming: true,
          });
        }
        return next;
      });
    },
    [isViewingStreamConversation]
  );

  const handleDone = useCallback(() => {
    // Always end processing globally so UI doesn’t get stuck,
    // but only finalize/remove status in the convo that owns the stream.
    const shouldMutate = isViewingStreamConversation();

    if (shouldMutate) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];

        if (last && last.type === "assistant" && last.streaming) {
          next[next.length - 1] = {
            ...last,
            streaming: false,
            content: finalizeForRender(last.content || ""),
          };
        }
        return next;
      });

      if (statusMsgIdRef.current) {
        removeMessage(statusMsgIdRef.current);
        statusMsgIdRef.current = null;
      }
    } else {
      // If user navigated away, just clear the status ref to avoid leaks
      statusMsgIdRef.current = null;
    }

    setIsProcessing(false);

    const cid =
      activeStreamRef.current.resolvedConversationId ||
      activeStreamRef.current.startedRouteConversationId ||
      null;

    if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
  }, [isViewingStreamConversation, removeMessage]);

  const handleError = useCallback(
    (err) => {
      // Always unblock processing
      setIsProcessing(false);

      if (!isViewingStreamConversation()) return;

      const msg = err?.message || t("landing.unexpectedError");
      addMessage("error", msg);

      const cid =
        activeStreamRef.current.resolvedConversationId ||
        activeStreamRef.current.startedRouteConversationId ||
        null;

      if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
    },
    [isViewingStreamConversation, addMessage, t]
  );

  const handleKVResults = useCallback(
    (kv) => {
      if (!kv || !kv.result_type) return;
      if (!isViewingStreamConversation()) return;

      if (kv.result_type === "table") {
        if (!isValidKVTable(kv)) return;
        addMessage("table", "", { kv });
        return;
      }

      let spec = kvToChartSpec(kv);

      if (!spec) {
        const normalized = normalizeKvResultType(kv.result_type);
        if (normalized && normalized !== kv.result_type) {
          spec = kvToChartSpec({ ...kv, result_type: normalized });
        }
      }

      if (!spec) return;

      addMessage("chart", "", {
        vegaSpec: spec,
        kvType: normalizeKvResultType(kv.result_type),
        isKV: true,
      });
    },
    [addMessage]
  );

  const { start, stop } = useLLMStream({
    fetcher: (...args) => authFetchRef.current?.(...args),
    onStatus: handleStatus,
    onChunk: handleChunk,
    onKVResults: handleKVResults,
    onError: handleError,
    onMetadata: (meta) => {
      conversationMetaRef.current = { ...conversationMetaRef.current, ...meta };

      const cidRaw = meta?.conversationId;
      const cid = cidRaw ? Number(cidRaw) : null;

      if (cid && !Number.isNaN(cid)) {
        // bind stream to real conversation id (needed for correct routing + UI)
        activeStreamRef.current = {
          ...activeStreamRef.current,
          resolvedConversationId: cid,
        };

        // notify sidebar which convo is generating
        emitStreamEvent("cap:stream-start", { conversationId: cid });
      }
    },

    onDone: () => {
      handleDone();

      const convId = conversationMetaRef.current.conversationId;
      if (!routeConversationId && convId) {
        navigate(`/conversations/${convId}`, { replace: true });
      }
    },
  });

  // Top queries refresher (safe: uses authFetchRef)
  useEffect(() => {
    let cancelled = false;

    async function loadTop() {
      const fetchFn = authFetchRef.current;
      if (!fetchFn || cancelled) return;

      try {
        const res = await fetchFn("/api/v1/nl/queries/top?limit=5");
        if (!res?.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        const list = data?.top_queries || data?.topQueries || data || [];
        if (Array.isArray(list) && list.length && !cancelled) {
          const normalized = list.map((item) =>
            typeof item === "string" ? { query: item } : item
          );
          setTopQueries(normalized);
        }
      } catch {
        // silent
      }
    }

    loadTop();
    const intervalId = setInterval(loadTop, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const sendQuery = useCallback(() => {
    const trimmed = (query || "").trim();
    const fetchFn = authFetchRef.current;

    if (!trimmed || isProcessing || !fetchFn) return;

    conversationMetaRef.current.emittedCreatedEvent = false;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);
    setIsProcessing(true);

    statusMsgIdRef.current = addMessage("status", t("landing.statusPlanning"));

    const body = {
      query: trimmed,
      conversation_id: routeConversationId ? Number(routeConversationId) : null,
    };

    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    activeStreamRef.current = {
      requestId,
      startedRouteConversationId: routeConversationId
        ? Number(routeConversationId)
        : null,
      resolvedConversationId: null,
    };

    start({
      url: NL_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body,
    });
  }, [
    query,
    isProcessing,
    addMessage,
    start,
    NL_ENDPOINT,
    routeConversationId,
    t,
  ]);

  useEffect(() => () => stop(), [stop]);

  const pinArtifact = useCallback(
    async (message) => {
      const fetchFn = authFetchRef.current;
      if (!fetchFn) return;

      try {
        if (message.type === "table") {
          if (!message.kv || !isValidKVTable(message.kv)) {
            showToast?.(t("landing.pinInvalidTable"), "warning");
            return;
          }
        }

        const idx = messages.findIndex((m) => m.id === message.id);
        let sourceQuery;
        if (idx > 0) {
          for (let i = idx - 1; i >= 0; i--) {
            if (messages[i].type === "user") {
              sourceQuery = messages[i].content;
              break;
            }
          }
        }

        const artifact_type = message.type === "table" ? "table" : "chart";
        const titleBase = artifact_type === "table" ? "Table" : "Chart";
        const title =
          message.title ||
          (sourceQuery
            ? `${titleBase}: ${sourceQuery.slice(0, 80)}`
            : `${titleBase} ${new Date().toLocaleTimeString()}`);

        const config =
          artifact_type === "table"
            ? { kv: message.kv }
            : { vegaSpec: message.vegaSpec, kvType: message.kvType };

        const res = await fetchFn("/api/v1/dashboard/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifact_type,
            title,
            source_query: sourceQuery,
            config,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to pin artifact");
        }

        showToast?.(t("landing.pinSuccess"), "success", {
          onClick: () => navigate("/dashboard"),
        });
      } catch (err) {
        console.error("Pin failed", err);
        showToast?.(t("landing.pinError"), "danger");
      }
    },
    [messages, showToast, navigate, t]
  );

  return (
    <div className="cap-root">
      <div className="container">
        <div className="chat-container">
          <div className="messages">
            {isLoadingConversation && (
              <div className="message status">
                <div className="message-avatar">…</div>
                <div className="message-content">
                  <div className="message-bubble">
                    <span>{t("landing.loadingConversation")}</span>
                    <span className="thinking-animation">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isLoadingConversation && messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🤖</div>
                <h2>{t("landing.emptyTitle")}</h2>
                <p>{t("landing.emptySubtitle")}</p>
              </div>
            )}

            {messages.map((m) =>
              m.type === "chart" && m.vegaSpec ? (
                <div key={m.id} className="message assistant">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="message-bubble markdown-body">
                      <VegaChart spec={m.vegaSpec} />
                      <div className="artifact-actions">
                        <button
                          className="artifact-pin-button"
                          onClick={() => pinArtifact(m)}
                        >
                          {t("landing.pinButton", "Pin to dashboard")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : m.type === "table" && m.kv && isValidKVTable(m.kv) ? (
                <div key={m.id} className="message assistant kv-message">
                  <div className="message-avatar">🤖</div>
                  <div className="message-content">
                    <div className="message-bubble markdown-body kv-bubble">
                      <KVTable kv={m.kv} />
                      <div className="artifact-actions">
                        <button
                          className="artifact-pin-button"
                          onClick={() => pinArtifact(m)}
                        >
                          {t("landing.pinButton", "Pin to dashboard")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Message key={m.id} type={m.type} content={m.content} />
              )
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <div className="empty-state-left">
              {t("landing.topQueriesTitle")}
            </div>

            <div className="examples">
              {topQueries.map((q, i) => (
                <button
                  key={`${q.query}-${i}`}
                  className={`example-chip ${isProcessing ? "disabled" : ""}`}
                  title={q.frequency ? `Asked ${q.frequency} times` : undefined}
                  onClick={() => {
                    if (!isProcessing) {
                      setQuery(q.query);
                      setCharCount(q.query.length);
                    }
                  }}
                >
                  {q.query}
                </button>
              ))}
            </div>

            <div className="input-wrapper">
              <div className="input-field">
                <textarea
                  value={query}
                  onChange={(e) => {
                    const value = e.target.value;
                    setQuery(value);
                    setCharCount(value.length);
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isProcessing && query.trim()) sendQuery();
                    }
                  }}
                  placeholder={t("landing.inputPlaceholder")}
                  rows={2}
                  maxLength={1000}
                  disabled={isProcessing}
                />
                <div className="char-count">
                  <span>
                    {t("landing.charCount", { count: charCount, max: 1000 })}
                  </span>
                </div>
              </div>

              <button
                className={`send-button ${isProcessing ? "processing" : ""}`}
                disabled={isProcessing || !query.trim()}
                onClick={() => !isProcessing && query.trim() && sendQuery()}
              >
                <span>
                  {isProcessing ? t("landing.processing") : t("landing.send")}
                </span>
                <span>
                  {isProcessing ? <div className="button-spinner" /> : "→"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Message({ type, content }) {
  const { t } = useTranslation();
  if (type === "status" && !String(content || "").trim()) return null;

  if (type === "status") {
    return (
      <div className="message status">
        <div className="message-avatar">…</div>
        <div className="message-content">
          <div className="message-bubble">
            <span>{content || t("landing.defaultStatus")}</span>
            <span className="thinking-animation">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "error") {
    return <div className="error-message">{content}</div>;
  }

  const isUser = type === "user";
  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">{isUser ? "🧑" : "🤖"}</div>
      <div className="message-content">
        <div className="message-bubble markdown-body">
          {isUser ? (
            <div className="fade-in">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre>
            </div>
          ) : (
            <div className="fade-in">
              <ReactMarkdown
                remarkPlugins={[
                  [remarkGfm],
                  [remarkMath, { singleDollarTextMath: true, strict: false }],
                ]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
              >
                {content || ""}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
