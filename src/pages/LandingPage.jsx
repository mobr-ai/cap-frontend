// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
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

import ShareModal from "@/components/ShareModal";
import { createSharePayloadForArtifact } from "@/utils/landingShareOps";

import "@/styles/LandingPage.css";

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

  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    messages,
    setMessages,
    streamingAssistantIdRef,
    statusMsgIdRef,
    addMessage,
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    resetStreamRefs,
  } = useLandingMessages();

  // Share modal (same behavior as DashboardPage)
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);
  const [conversationTitle, setConversationTitle] = useState("");

  const { isLoadingConversation } = useLandingConversationLoader({
    routeConversationId,
    authFetchRef,
    setMessages,
    setConversationTitle,
    showToast,
    t,
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
    [showToast, t]
  );

  const conversationMetaRef = useRef({
    conversationId: routeConversationId ? Number(routeConversationId) : null,
    userMessageId: null,
    emittedCreatedEvent: false,
  });

  const messagesEndRef = useRef(null);

  // Auto scroll behavior
  useLandingAutoScroll({
    messages,
    isLoadingConversation,
    routeConversationId,
    messagesEndRef,
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
      upsertStatus(text);
    },
    [isViewingStreamConversation, upsertStatus]
  );

  const handleChunk = useCallback(
    (raw) => {
      const chunk = sanitizeChunk(raw);
      if (!chunk) return;
      if (!isViewingStreamConversation()) return;
      appendAssistantChunk(chunk);
    },
    [isViewingStreamConversation, appendAssistantChunk]
  );

  const handleDone = useCallback(() => {
    const shouldMutate = isViewingStreamConversation();

    if (shouldMutate) {
      finalizeStreamingAssistant();
      clearStatus();
    } else {
      // avoid leaks
      statusMsgIdRef.current = null;
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
    emitStreamEvent,
    statusMsgIdRef,
    streamingAssistantIdRef,
  ]);

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
    [addMessage, isViewingStreamConversation]
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

  const { topQueries } = useLandingTopQueries({
    authFetchRef,
    initialTopQueries: [
      { query: "Markdown formatting test" },
      { query: "Current trends" },
      { query: "List the latest 5 blocks" },
      { query: "Show the last 5 proposals" },
      {
        query: "Plot a bar chart showing monthly multi assets created in 2021",
      },
      {
        query:
          "Plot a line chart showing monthly number of transactions and outputs",
      },
      {
        query:
          "Plot a pie chart to show how much the top 1% ADA holders represent from the total supply on the Cardano network",
      },
    ],
    limit: 5,
    refreshMs: 5 * 60 * 1000,
  });

  const sendQuery = useCallback(() => {
    const trimmed = (query || "").trim();
    const fetchFn = authFetchRef.current;

    if (!trimmed || isProcessing || !fetchFn) return;

    resetStreamRefs();

    conversationMetaRef.current.emittedCreatedEvent = false;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);
    setIsProcessing(true);

    upsertStatus(t("landing.statusPlanning"));

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
    [messages, showToast, navigate, t, routeConversationId]
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
    [messages, conversationTitle, tableElByMsgIdRef, handleSharePayload]
  );

  return (
    <div className="cap-root">
      <div className="container">
        <div className="chat-container">
          <div className="messages">
            {messages.map((m) =>
              (m.type === "chart" && m.vegaSpec) ||
              (m.type === "table" && m.kv) ? (
                <ArtifactMessage
                  key={m.id}
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
                  key={m.id}
                  type={m.type}
                  content={m.content}
                  streaming={!!m.streaming}
                  replayTyping={!!m.replayTyping}
                />
              )
            )}
          </div>

          <div className="input-container">
            <TopQueries
              title={t("landing.topQueriesTitle")}
              topQueries={topQueries}
              isProcessing={isProcessing}
              onSelectQuery={(q) => {
                setQuery(q.query);
                setCharCount(q.query.length);
              }}
            />

            <ChatInput
              query={query}
              setQuery={setQuery}
              charCount={charCount}
              setCharCount={setCharCount}
              isProcessing={isProcessing}
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

            <div ref={messagesEndRef} />
          </div>
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
