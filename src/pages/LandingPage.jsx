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

import {
  mergeById,
  injectArtifactsAfterMessage,
  normalizeKvResultType,
} from "@/utils/landingMessageOps";

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationOwnerId, setConversationOwnerId] = useState(null);

  // Block queries if sync service is Offline or Unknown
  const statusCode = String(syncStatus?.code || "unknown");
  const isSyncUnknown = statusCode === "unknown" || statusCode === "checking";
  const isSyncOffline = healthOnline === false;
  const isSyncBlocked = isSyncOffline || isSyncUnknown || healthOnline == null;

  const location = useLocation();

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

    // Optional fallback: /admin/conversations/123?mid=456
    const params = new URLSearchParams(location?.search || "");
    const mid = params.get("mid") || params.get("messageId") || null;
    return mid ? String(mid) : null;
  }, [location?.state, location?.search]);

  const isAdminReadonlyRoute = location.pathname.startsWith(
    "/admin/conversations/",
  );
  const sessionUserId =
    session?.user_id ?? session?.userId ?? session?.id ?? null;

  const isOwner =
    sessionUserId != null &&
    conversationOwnerId != null &&
    String(sessionUserId) === String(conversationOwnerId);

  // Admin route is read-only only when viewing someone else's conversation.
  // If owner is unknown, stay conservative (read-only) to avoid privilege bugs.
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
  } = useLandingMessages();

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Share modal (same behavior as DashboardPage)
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

  // Per-artifact refs for exporting images
  const chartViewByMsgIdRef = useRef(new Map()); // Map<msgId, vegaView>
  const tableElByMsgIdRef = useRef(new Map()); // Map<msgId, HTMLElement>
  const chartElByMsgIdRef = useRef(new Map()); // Map<msgId, HTMLElement>

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
  const messageElsRef = useRef(new Map()); // Map<messageId, HTMLElement>

  // Auto scroll behavior
  const { scrollToBottom, scrollToMessageId } = useLandingAutoScroll({
    messages,
    isLoadingConversation,
    routeConversationId,
    messagesEndRef,
    messageElsRef,
    initialScrollMessageId,
  });

  // Keep ref in sync with route
  useEffect(() => {
    const id = routeConversationId;
    conversationMetaRef.current.conversationId = id ? Number(id) : null;
  }, [routeConversationId]);

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

    // NEW CHAT ROUTE ("/")
    // Always accept status/chunks for the active stream
    if (!routeId) return true;

    // CONVERSATION ROUTE
    const targetId =
      typeof s.resolvedConversationId === "number" &&
      !Number.isNaN(s.resolvedConversationId)
        ? s.resolvedConversationId
        : s.startedRouteConversationId;

    return !!targetId && routeId === targetId;
  }, [routeConversationId]);

  const emitStreamEvent = useCallback((type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      // ignore
    }
  }, []);

  const handleStatus = useCallback(
    (text) => {
      console.log("[SSE status]", text);

      if (!text) return;

      // Backend status is always relevant to the active stream UI
      hasBackendStatusRef.current = true;
      upsertStatus(text);

      setTimeout(() => {
        console.log("[messages tail]", messagesRef.current.slice(-3));
      }, 0);
    },
    [upsertStatus],
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

    // ALWAYS stop animations / typing-mode for the current UI state
    clearStatus();
    finalizeStreamingAssistant();

    // If we are no longer viewing the stream’s conversation, also cleanup leftovers
    if (!isViewingStreamConversation()) {
      dropAllStreamingAssistants();
      resetStreamRefs();
    }

    setIsProcessing(false);

    const cid =
      activeStreamRef.current.resolvedConversationId ||
      activeStreamRef.current.startedRouteConversationId ||
      null;

    if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
  }, [
    isViewingStreamConversation,
    finalizeStreamingAssistant,
    clearStatus,
    dropAllStreamingAssistants,
    resetStreamRefs,
    emitStreamEvent,
  ]);

  const handleError = useCallback(
    (err) => {
      hasBackendStatusRef.current = false;

      const shouldMutate = isViewingStreamConversation();

      if (shouldMutate) {
        clearStatus();
        const msg = err?.message || t("landing.unexpectedError");
        addMessage("error", msg);
      } else {
        dropAllStreamingAssistants();
        resetStreamRefs();
      }

      setIsProcessing(false);

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

      const rawCid = meta.conversationId;
      const rawUserMsgId = meta.userMessageId;

      const cid =
        typeof rawCid === "number" && Number.isFinite(rawCid) ? rawCid : null;

      const userMessageId =
        typeof rawUserMsgId === "number" && Number.isFinite(rawUserMsgId)
          ? rawUserMsgId
          : null;

      // Nothing useful
      if (!cid && !userMessageId) return;

      // Bind stream refs so status/chunks keep flowing correctly even on "/"
      // (Important: resolvedConversationId can appear BEFORE we navigate to /conversations/:id)
      activeStreamRef.current = {
        ...activeStreamRef.current,
        resolvedConversationId:
          cid || activeStreamRef.current.resolvedConversationId,
        // Keep startedRouteConversationId intact if already set elsewhere
        startedRouteConversationId:
          activeStreamRef.current.startedRouteConversationId ?? null,
      };

      // Bind conversationMetaRef too (used by done/navigation / other logic)
      conversationMetaRef.current = {
        ...conversationMetaRef.current,
        conversationId: cid || conversationMetaRef.current.conversationId,
        userMessageId:
          userMessageId || conversationMetaRef.current.userMessageId,
      };

      // Emit stream-start only once per stream
      if (cid && !activeStreamRef.current._streamStartEmitted) {
        activeStreamRef.current._streamStartEmitted = true;
        emitStreamEvent("cap:stream-start", { conversationId: cid });
      }
    },
    [emitStreamEvent],
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
    setIsProcessing(true);

    ensureStreamingAssistant();

    // Fallback only; backend status will replace it as soon as the first status arrives
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
    isSyncBlocked,
    addMessage,
    upsertStatus,
    resetStreamRefs,
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
                    const key = String(m.id);
                    if (el) messageElsRef.current.set(key, el);
                    else messageElsRef.current.delete(key);
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
