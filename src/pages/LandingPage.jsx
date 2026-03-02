// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useOutletContext,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";

import { useTranslation } from "react-i18next";

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

import ArtifactToolButton from "@/components/landing/ArtifactToolButton";

import { normalizeKvResultType } from "@/utils/landingMessageOps";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import { useLLMStream } from "@/hooks/useLLMStream";
import { useLandingMessages } from "@/hooks/useLandingMessages";
import { useLandingTopQueries } from "@/hooks/useLandingTopQueries";
import { useLandingAutoScroll } from "@/hooks/useLandingAutoScroll";
import { useLandingConversationLoader } from "@/hooks/useLandingConversationLoader";

import { sanitizeChunk } from "@/utils/streamSanitizers";
import { kvToChartSpec } from "@/utils/kvCharts";

import { isValidKVTable } from "@/components/artifacts/KVTable";
import { pinLandingArtifact } from "@/utils/landingPinOps";
import ChatMessage from "@/components/landing/ChatMessage";
import ArtifactMessage from "@/components/landing/ArtifactMessage";
import TopQueries from "@/components/landing/TopQueries";
import ChatInput from "@/components/landing/ChatInput";
import LandingEmptyState from "@/components/landing/LandingEmptyState";

import ShareModal from "@/components/ShareModal";
import { createSharePayloadForArtifact } from "@/utils/landingShareOps";
import { getSessionUserId } from "@/utils/authUtils";
import "@/styles/LandingPage.css";

export default function LandingPage() {
  const NL_ENDPOINT = import.meta.env.VITE_NL_ENDPOINT || "/api/v1/nl/query";

  const outlet = useOutletContext() || {};
  const { session, showToast, healthOnline, syncStatus } = outlet;
  const { authFetch } = useAuthRequest({ session, showToast });
  const authFetchRef = useRef(null);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [processingByKey, setProcessingByKey] = useState({});
  const [conversationOwnerId, setConversationOwnerId] = useState(null);

  // Block queries if sync service is Offline or Unknown
  const statusCode = String(syncStatus?.code || "unknown");
  const isSyncUnknown = statusCode === "unknown" || statusCode === "checking";
  const isSyncOffline = healthOnline === false;
  const isSyncBlocked = isSyncOffline || isSyncUnknown || healthOnline == null;

  const location = useLocation();

  const routeConvoKey = routeConversationId
    ? `conv:${Number(routeConversationId)}`
    : "root";

  const isProcessing = !!processingByKey?.[routeConvoKey]?.isProcessing;

  const setProcessingForKey = useCallback((key, isProc, extra = {}) => {
    if (!key) return;
    setProcessingByKey((prev) => {
      const next = { ...(prev || {}) };
      const existing = next[key] || {};
      next[key] = {
        ...existing,
        ...extra,
        isProcessing: !!isProc,
      };
      return next;
    });
  }, []);

  const migrateProcessingKey = useCallback((fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setProcessingByKey((prev) => {
      const p = prev || {};
      const from = p[fromKey];
      if (!from?.isProcessing) return prev;

      const next = { ...p };
      delete next[fromKey];
      next[toKey] = { ...(next[toKey] || {}), ...from, isProcessing: true };
      return next;
    });
  }, []);

  // Prefer location.state (internal navigation), fallback to URL (?mid=123)
  const initialScrollMessageId = React.useMemo(() => {
    const st = location?.state || {};
    const v =
      st.initialScrollMessageId ??
      st.focusMessageId ??
      st.conversation_message_id ??
      st.conversationMessageId ??
      null;

    if (v != null) return String(v);

    const params = new URLSearchParams(location?.search || "");
    const mid = params.get("mid") || params.get("messageId") || null;
    return mid ? String(mid) : null;
  }, [location?.state, location?.search]);

  const isAdminReadonlyRoute = location.pathname.startsWith(
    "/admin/conversations/",
  );
  const sessionUserId = getSessionUserId(session);

  const isOwner =
    sessionUserId != null &&
    conversationOwnerId != null &&
    String(sessionUserId) === String(conversationOwnerId);

  const readOnly = !!isAdminReadonlyRoute && !isOwner;

  const sendBlockedReason = isSyncOffline
    ? t(
        "landing.syncBlockedOffline",
        "Sync service is offline. Try again soon.",
      )
    : t(
        "landing.syncBlockedUnknown",
        "Sync service status is unknown. Please wait a moment and retry.",
      );

  const {
    messages,
    setMessages,
    addMessage,
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    dropAllStreamingAssistants,
    resetStreamRefs,
    ensureStreamingAssistant,
    bindStreamScope,
  } = useLandingMessages();

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);
  const [conversationTitle, setConversationTitle] = useState("");

  const { isLoadingConversation } = useLandingConversationLoader({
    routeConversationId,
    authFetchRef,
    setMessages,
    setConversationTitle,
    setConversationOwnerId,
    showToast,
    t,
    mode: isAdminReadonlyRoute ? "admin" : "user",
  });

  const chartViewByMsgIdRef = useRef(new Map());
  const tableElByMsgIdRef = useRef(new Map());
  const chartElByMsgIdRef = useRef(new Map());

  const handleSharePayload = useCallback(
    (payload) => {
      if (payload?.error === "share_failed") {
        showToast?.(t("dashboard.widgetShareFailed"), "danger");
        return;
      }
      setSharePayload(payload);
      setShareOpen(true);
    },
    [showToast, t],
  );

  const conversationMetaRef = useRef({
    conversationId: routeConversationId ? Number(routeConversationId) : null,
    userMessageId: null,
    emittedCreatedEvent: false,
  });

  const messagesEndRef = useRef(null);
  const hasBackendStatusRef = useRef(false);
  const messageElsRef = useRef(new Map());

  const { scrollToBottom } = useLandingAutoScroll({
    messages,
    isLoadingConversation,
    routeConversationId,
    messagesEndRef,
    messageElsRef,
    initialScrollMessageId,
  });

  useEffect(() => {
    const id = routeConversationId;
    conversationMetaRef.current.conversationId = id ? Number(id) : null;
  }, [routeConversationId]);

  const activeStreamRef = useRef({
    requestId: null,
    startedRouteConversationId: routeConversationId
      ? Number(routeConversationId)
      : null,
    resolvedConversationId: null,
  });

  const isViewingStreamConversation = useCallback(() => {
    const routeId = routeConversationId ? Number(routeConversationId) : null;
    const s = activeStreamRef.current;

    if (!routeId) {
      return s.startedRouteConversationId == null;
    }

    const targetId =
      typeof s.resolvedConversationId === "number" &&
      !Number.isNaN(s.resolvedConversationId)
        ? s.resolvedConversationId
        : s.startedRouteConversationId;

    return !!targetId && routeId === targetId;
  }, [routeConversationId]);

  const streamConvoKey = useCallback(() => {
    const s = activeStreamRef.current;
    const resolved = s?.resolvedConversationId;
    const started = s?.startedRouteConversationId;
    const cid =
      typeof resolved === "number" && Number.isFinite(resolved)
        ? resolved
        : typeof started === "number" && Number.isFinite(started)
          ? started
          : null;
    return cid != null ? `conv:${cid}` : "root";
  }, []);

  const emitStreamEvent = useCallback((type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      // ignore
    }
  }, []);

  const handleStatus = useCallback(
    (text) => {
      if (!text) return;
      if (!isViewingStreamConversation()) return;

      hasBackendStatusRef.current = true;
      upsertStatus(text);
    },
    [isViewingStreamConversation, upsertStatus],
  );

  const handleChunk = useCallback(
    (raw) => {
      const chunk = sanitizeChunk(raw);
      if (!chunk) return;
      if (!isViewingStreamConversation()) return;
      appendAssistantChunk(chunk);
    },
    [isViewingStreamConversation, appendAssistantChunk],
  );

  const handleDone = useCallback(() => {
    hasBackendStatusRef.current = false;

    // IMPORTANT: convo-based processing must be cleared using fresh closures
    setProcessingForKey(streamConvoKey(), false);

    const viewing = isViewingStreamConversation();

    if (viewing) {
      clearStatus();
      finalizeStreamingAssistant();
    } else {
      dropAllStreamingAssistants();
    }

    resetStreamRefs();

    const cid =
      activeStreamRef.current.resolvedConversationId ||
      activeStreamRef.current.startedRouteConversationId ||
      null;

    if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
  }, [
    isViewingStreamConversation,
    clearStatus,
    finalizeStreamingAssistant,
    dropAllStreamingAssistants,
    resetStreamRefs,
    emitStreamEvent,
    setProcessingForKey,
    streamConvoKey,
  ]);

  const handleError = useCallback(
    (err) => {
      hasBackendStatusRef.current = false;

      setProcessingForKey(streamConvoKey(), false);

      const viewing = isViewingStreamConversation();

      if (viewing) {
        clearStatus();
        const msg = err?.message || t("landing.unexpectedError");
        addMessage("error", msg);
      } else {
        dropAllStreamingAssistants();
      }

      resetStreamRefs();

      const cid =
        activeStreamRef.current.resolvedConversationId ||
        activeStreamRef.current.startedRouteConversationId ||
        null;

      if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
    },
    [
      isViewingStreamConversation,
      clearStatus,
      addMessage,
      t,
      dropAllStreamingAssistants,
      resetStreamRefs,
      emitStreamEvent,
      setProcessingForKey,
      streamConvoKey,
    ],
  );

  const handleKVResults = useCallback(
    (kv) => {
      if (!kv || !kv.result_type) return;
      if (!isViewingStreamConversation()) return;

      if (kv.result_type === "table") {
        if (!isValidKVTable(kv)) return;
        addMessage("table", "", { kv, insertBeforeStreamingAssistant: true });
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
        insertBeforeStreamingAssistant: true,
      });
    },
    [addMessage, isViewingStreamConversation],
  );

  const handleOnMetadata = useCallback(
    (meta) => {
      if (!meta) return;

      const rid = meta.requestId || null;
      const rawCid = meta.conversationId;
      const rawUserMsgId = meta.userMessageId;

      const cid =
        typeof rawCid === "number" && Number.isFinite(rawCid) ? rawCid : null;

      const userMessageId =
        typeof rawUserMsgId === "number" && Number.isFinite(rawUserMsgId)
          ? rawUserMsgId
          : null;

      if (!cid && !userMessageId) return;

      if (
        cid &&
        (activeStreamRef.current.startedRouteConversationId == null ||
          Number.isNaN(activeStreamRef.current.startedRouteConversationId))
      ) {
        migrateProcessingKey("root", `conv:${cid}`);
      }

      activeStreamRef.current = {
        ...activeStreamRef.current,
        requestId: rid || activeStreamRef.current.requestId,
        resolvedConversationId:
          cid || activeStreamRef.current.resolvedConversationId,
        startedRouteConversationId:
          activeStreamRef.current.startedRouteConversationId ?? null,
      };

      conversationMetaRef.current = {
        ...conversationMetaRef.current,
        conversationId: cid || conversationMetaRef.current.conversationId,
        userMessageId:
          userMessageId || conversationMetaRef.current.userMessageId,
      };

      if (cid && !activeStreamRef.current._streamStartEmitted) {
        activeStreamRef.current._streamStartEmitted = true;
        emitStreamEvent("cap:stream-start", { conversationId: cid });
      }
    },
    [emitStreamEvent, migrateProcessingKey],
  );

  const isDev = import.meta.env.DEV === true;
  const isDemoEndpoint = String(NL_ENDPOINT || "").includes(
    "/api/v1/demo/nl/query",
  );

  const { start, stop } = useLLMStream({
    fetcher: (...args) => authFetchRef.current?.(...args),
    onStatus: handleStatus,
    onChunk: handleChunk,
    onKVResults: handleKVResults,
    onError: handleError,
    onMetadata: handleOnMetadata,
    acceptBareStatusLines: isDev && isDemoEndpoint,
    onDone: () => {
      handleDone();

      const convId = conversationMetaRef.current.conversationId;
      if (!routeConversationId && convId) {
        navigate(`/conversations/${convId}`, { replace: true });
      }
    },
  });

  const { topQueries } = useLandingTopQueries({
    authFetchRef,
    initialTopQueries: isDev
      ? [
          { query: "Heatmap of transaction activity by day and hour" },
          { query: "Treemap breaking down NFT mints by policy ID" },
          { query: "Transaction fee vs transaction value" },
          { query: "Bubble chart representing governance proposals" },
          { query: "Markdown formatting test" },
          { query: "Current trends" },
          { query: "List the latest 5 blocks" },
          { query: "Show the last 5 proposals" },
          {
            query:
              "Plot a bar chart showing monthly multi assets created in 2021",
          },
          {
            query:
              "Plot a line chart showing monthly number of transactions and outputs",
          },
          {
            query:
              "Plot a pie chart to show how much the top 1% ADA holders represent from the total supply on the Cardano network",
          },
          {
            query:
              "how many blocks were produced by this SPO pool18rjrygm3knlt67n3r3prlhnzcjxun7wa8d3l8w9nmlpasquv4au in the current epoch?",
          },
        ]
      : undefined,
    limit: 5,
    refreshMs: 5 * 60 * 1000,
  });

  const sendQuery = useCallback(() => {
    if (readOnly) {
      showToast?.(t("admin.queryDetails.readOnlyConversation"), "secondary");
      return;
    }

    const trimmed = (query || "").trim();
    const fetchFn = authFetchRef.current;

    if (!trimmed || isProcessing || !fetchFn || isSyncBlocked) return;

    resetStreamRefs();
    hasBackendStatusRef.current = false;

    conversationMetaRef.current.emittedCreatedEvent = false;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);

    ensureStreamingAssistant();

    if (
      !hasBackendStatusRef.current &&
      !activeStreamRef.current._fallbackStatusWritten
    ) {
      activeStreamRef.current._fallbackStatusWritten = true;
      upsertStatus(t("landing.statusPlanning"));
    }

    const demoDelayMs = Number(import.meta.env.VITE_DEMO_STREAM_DELAY_MS || 0);
    const shouldDelay =
      isDev &&
      isDemoEndpoint &&
      Number.isFinite(demoDelayMs) &&
      demoDelayMs > 0;

    const body = {
      query: trimmed,
      conversation_id: routeConversationId ? Number(routeConversationId) : null,
      ...(shouldDelay ? { delay_ms: demoDelayMs } : {}),
    };

    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    activeStreamRef.current = {
      requestId,
      startedRouteConversationId: routeConversationId
        ? Number(routeConversationId)
        : null,
      resolvedConversationId: null,
    };

    bindStreamScope({
      requestId,
      conversationId: routeConversationId ? Number(routeConversationId) : null,
    });

    const startedKey = routeConversationId
      ? `conv:${Number(routeConversationId)}`
      : "root";
    setProcessingForKey(startedKey, true, { requestId });

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
    readOnly,
    showToast,
    t,
    query,
    isProcessing,
    isSyncBlocked,
    resetStreamRefs,
    addMessage,
    ensureStreamingAssistant,
    upsertStatus,
    bindStreamScope,
    start,
    NL_ENDPOINT,
    routeConversationId,
    isDev,
    isDemoEndpoint,
    setProcessingForKey,
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

        const conversationId =
          conversationMetaRef.current.conversationId ||
          (routeConversationId ? Number(routeConversationId) : null);

        await pinLandingArtifact({
          fetchFn,
          message,
          messages,
          conversationId,
        });

        showToast?.(t("landing.pinSuccess"), "success", {
          onClick: () => navigate("/dashboard"),
        });
      } catch (err) {
        console.error("Pin failed", err);
        showToast?.(t("landing.pinError"), "danger");
      }
    },
    [messages, showToast, navigate, t, routeConversationId],
  );

  const shareArtifact = useCallback(
    async (message) => {
      const payload = await createSharePayloadForArtifact({
        message,
        messages,
        conversationTitle,
        tableElByMsgIdRef,
      });

      handleSharePayload(payload);
    },
    [messages, conversationTitle, tableElByMsgIdRef, handleSharePayload],
  );

  const isEmptyState = messages.length === 0 && !isLoadingConversation;

  return (
    <div className="cap-root">
      <div className="container">
        <div className={`chat-container ${isEmptyState ? "is-empty" : ""}`}>
          <div className="messages">
            {isEmptyState ? (
              <LandingEmptyState
                t={t}
                topQueries={topQueries}
                isProcessing={isProcessing}
                typingMsPerChar={18}
                pauseAfterTypedMs={2800}
                fadeMs={200}
              />
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  ref={(el) => {
                    if (!messageElsRef.current) return;

                    const keys = [];
                    if (m?.id != null) keys.push(String(m.id));
                    if (m?.conv_message_id != null)
                      keys.push(String(m.conv_message_id));

                    for (const k of keys) {
                      if (el) messageElsRef.current.set(k, el);
                      else messageElsRef.current.delete(k);
                    }
                  }}
                  data-msgid={m.id}
                >
                  {(m.type === "chart" && m.vegaSpec) ||
                  (m.type === "table" && m.kv) ? (
                    <ArtifactMessage
                      message={m}
                      pinArtifact={pinArtifact}
                      shareArtifact={shareArtifact}
                      chartElByMsgIdRef={chartElByMsgIdRef}
                      chartViewByMsgIdRef={chartViewByMsgIdRef}
                      tableElByMsgIdRef={tableElByMsgIdRef}
                      ArtifactToolBtn={ArtifactToolButton}
                    />
                  ) : (
                    <ChatMessage
                      id={m.id}
                      type={m.type}
                      content={m.content}
                      statusText={m.statusText}
                      streaming={!!m.streaming}
                      replayTyping={!!m.replayTyping}
                      replayKey={m.replayKey ?? null}
                    />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="input-container">
            <div
              className={`top-queries-wrap ${
                isEmptyState ? "is-visible" : "is-hidden"
              }`}
              aria-hidden={!isEmptyState}
            >
              <TopQueries
                title={t("landing.topQueriesTitle")}
                topQueries={topQueries}
                isProcessing={isProcessing}
                onSelectQuery={(q) => {
                  setQuery(q.query);
                  setCharCount(q.query.length);
                  scrollToBottom("smooth");
                }}
              />
            </div>

            <ChatInput
              readOnly={readOnly}
              readOnlyReason={t("admin.queryDetails.readOnlyConversation")}
              query={query}
              setQuery={setQuery}
              charCount={charCount}
              setCharCount={setCharCount}
              isProcessing={isProcessing}
              isSyncBlocked={isSyncBlocked}
              syncBlockedReason={sendBlockedReason}
              maxLength={1000}
              placeholder={t("landing.inputPlaceholder")}
              charCountText={t("landing.charCount", {
                count: charCount,
                max: 1000,
              })}
              processingLabel={t("landing.processing")}
              sendLabel={t("landing.send")}
              onSend={sendQuery}
            />
          </div>
          <div ref={messagesEndRef} />
        </div>

        <ShareModal
          show={shareOpen}
          onHide={() => setShareOpen(false)}
          title={sharePayload?.title || "CAP"}
          hashtags={sharePayload?.hashtags || ["CAP"]}
          link={null}
          message={sharePayload?.message || ""}
          imageDataUrl={sharePayload?.imageDataUrl || null}
        />
      </div>
    </div>
  );
}
