// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuthRequest } from "../hooks/useAuthRequest";
import "../styles/LandingPage.css";

// LandingPage: Natural Language chat (analytics now lives in NavBar)
export default function LandingPage() {
  const { authFetch } = useAuthRequest();

  // --- Refs & state ---------------------------------------------------------
  const messagesEndRef = useRef(null);
  const [messages, setMessages] = useState([]); // { id, type: 'user'|'assistant'|'status'|'error', content }
  const [isProcessing, setIsProcessing] = useState(false);
  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [topQueries, setTopQueries] = useState([]);

  // polling refs
  const pollTimerRef = useRef(null);
  const inFlightRef = useRef(null);
  const startedRef = useRef(false); // prevents double-start in StrictMode
  const runningRef = useRef(false); // prevents re-entry
  const backoffRef = useRef(60_000); // success cadence (1 min)
  const MAX_BACKOFF = 60 * 60_000; // 60 min

  // keep authFetch stable for callbacks
  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  // --- Data: top queries ----------------------------------------------------
  const loadTopQueries = useCallback(async (signal) => {
    const doFetch = authFetchRef.current;
    try {
      const res = await doFetch("/api/v1/nl/queries/top?limit=5", { signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const q = Array.isArray(data?.top_queries) ? data.top_queries : [];
      setTopQueries(q);
      backoffRef.current = 60_000; // reset cadence to 1 min on success
      return true;
    } catch {
      setTopQueries([
        { query: "Show me the latest 5 blocks", frequency: 0 },
        { query: "What is the total ADA in circulation?", frequency: 0 },
        { query: "List latest governance votes", frequency: 0 },
        { query: "Top stake pools by active stake", frequency: 0 },
        { query: "Find transactions to address X", frequency: 0 },
      ]);
      return false;
    }
  }, []);

  const scheduleNext = useCallback((delay) => {
    clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(() => runPoll(), delay);
  }, []);

  const runPoll = useCallback(async () => {
    if (runningRef.current) return; // don’t re-enter
    if (document.hidden) {
      // pause in background tab
      scheduleNext(5_000);
      return;
    }

    runningRef.current = true;
    inFlightRef.current?.abort?.();
    const controller = new AbortController();
    inFlightRef.current = controller;

    const ok = await loadTopQueries(controller.signal);

    if (!ok) {
      // exponential backoff + jitter
      const next = Math.min(backoffRef.current * 2, MAX_BACKOFF);
      backoffRef.current = next;
      const jitter = Math.floor(Math.random() * 2_000);
      scheduleNext(backoffRef.current + jitter);
    } else {
      scheduleNext(backoffRef.current);
    }
    runningRef.current = false;
  }, [loadTopQueries, scheduleNext]);

  useEffect(() => {
    // HARD singleton across HMR/StrictMode (dev)
    if (typeof window !== "undefined") {
      if (window.__capTopQueriesStop__) window.__capTopQueriesStop__(); // stop any previous
      window.__capTopQueriesStop__ = () => {
        clearTimeout(pollTimerRef.current);
        inFlightRef.current?.abort?.();
        runningRef.current = false;
        startedRef.current = false;
      };
    }

    if (!startedRef.current) {
      startedRef.current = true;
      runPoll();
    }

    const onVisible = () => !document.hidden && scheduleNext(0);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.__capTopQueriesStop__?.();
    };
  }, [runPoll, scheduleNext]);

  // --- Helpers --------------------------------------------------------------
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = useCallback((type, content) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        content,
      },
    ]);
  }, []);

  const removeLastOfType = useCallback((type) => {
    setMessages((prev) => {
      const idxFromEnd = [...prev].reverse().findIndex((m) => m.type === type);
      if (idxFromEnd === -1) return prev;
      const real = prev.length - 1 - idxFromEnd;
      return [...prev.slice(0, real), ...prev.slice(real + 1)];
    });
  }, []);

  const replaceLastStatusWith = useCallback((type, content) => {
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((m) => m.type === "status");
      if (idx === -1)
        return [...prev, { id: Date.now().toString(), type, content }];
      const real = prev.length - 1 - idx;
      const copy = [...prev];
      copy[real] = { ...copy[real], type, content };
      return copy;
    });
  }, []);

  // --- Send query (server-sent events / streaming) --------------------------
  const sendQuery = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isProcessing) return;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);
    setIsProcessing(true);

    // status placeholder
    addMessage("status", "Planning the query and preparing SPARQL...");

    try {
      const res = await authFetch("/api/v1/nl/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantStarted = false;
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const raw of lines) {
          if (!raw) continue;
          if (raw === "data: [DONE]" || raw.trim() === "[DONE]") {
            // finalize status removal
            removeLastOfType("status");
            continue;
          }

          let content = raw.startsWith("data: ") ? raw.slice(6) : raw;
          const isStatus = content.startsWith("status: ");
          if (isStatus) content = content.slice(8);

          if (content.startsWith("Error:")) {
            replaceLastStatusWith("error", content);
            continue;
          }

          if (isStatus) {
            replaceLastStatusWith("status", content);
          } else {
            if (!assistantStarted) {
              // remove status and start assistant bubble
              replaceLastStatusWith("assistant", "");
              assistantStarted = true;
            }
            assistantText += content;
            // live update last assistant message
            setMessages((prev) => {
              const idx = [...prev]
                .reverse()
                .findIndex((m) => m.type === "assistant");
              if (idx === -1)
                return [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    type: "assistant",
                    content: assistantText,
                  },
                ];
              const real = prev.length - 1 - idx;
              const copy = [...prev];
              copy[real] = { ...copy[real], content: assistantText };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      replaceLastStatusWith(
        "error",
        `Error: ${e?.message || "Unknown"}. Please try again.`
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    query,
    isProcessing,
    authFetch,
    addMessage,
    replaceLastStatusWith,
    removeLastOfType,
  ]);

  // --- Render ---------------------------------------------------------------
  return (
    <div className="cap-root">
      <div className="container">
        <div className="chat-container">
          <div className="messages">
            {messages.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🤖</div>
                <h2>Ask about Cardano</h2>
                <p>
                  Query the Cardano blockchain using natural language. Ask about
                  transactions, blocks, stake pools, governance, or any on-chain
                  data.
                </p>
              </div>
            )}

            {messages.map((m) => (
              <Message key={m.id} type={m.type} content={m.content} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-container">
            <div className="empty-state-left">Top 5 frequent queries</div>
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
            <div className="empty-state" style={{ height: 0, padding: 0 }} />

            <div className="input-wrapper">
              <div className="input-field">
                <textarea
                  value={query}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    setCharCount(v.length);
                    // autoresize
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
                  placeholder="Ask a question about Cardano..."
                  rows={2}
                  maxLength={1000}
                  disabled={isProcessing}
                />
                <div className="char-count">
                  <span>{charCount}</span>/1000
                </div>
              </div>
              <button
                className={`send-button ${isProcessing ? "processing" : ""}`}
                disabled={isProcessing || !query.trim()}
                onClick={() => !isProcessing && query.trim() && sendQuery()}
              >
                <span>{isProcessing ? "Processing" : "Send"}</span>
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
  if (type === "status") {
    return (
      <div className="message status">
        <div className="message-avatar" />
        <div className="message-content">
          <div className="message-bubble">
            <span>{content || ""}</span>
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
        <div className="message-bubble">
          <div className="message-text">{content}</div>
        </div>
      </div>
    </div>
  );
}
