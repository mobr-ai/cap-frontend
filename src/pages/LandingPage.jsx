// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
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

// Helper to join streaming chunks in a “smart” way
function appendChunkSmart(prev, chunk) {
  if (!chunk) return prev || "";
  if (!prev) return chunk;

  const lastChar = prev[prev.length - 1];
  const firstChar = chunk[0];

  const isLetter = (ch) => /[A-Za-z]/.test(ch || "");
  const isDigit = (ch) => /[0-9]/.test(ch || "");

  // 1. If the new chunk already starts with whitespace, trust it.
  if (/^\s/.test(chunk)) {
    return prev + chunk;
  }

  // 2. If prev already ends with whitespace, just append.
  if (/\s/.test(lastChar)) {
    return prev + chunk;
  }

  // 3. Sentence punctuation followed by a letter: ".Next" -> ". Next"
  if (/[.!?]/.test(lastChar) && isLetter(firstChar)) {
    return prev + " " + chunk;
  }

  // 4. Letter -> digit (e.g. "top 10", "Epoch 88"),
  //    but avoid splitting address-like prefixes (addr1..., stake1..., pool1...).
  if (isLetter(lastChar) && isDigit(firstChar)) {
    const tail = prev.slice(-6).toLowerCase();
    if (
      tail.endsWith("addr") ||
      tail.endsWith("stake") ||
      tail.endsWith("pool")
    ) {
      // looks like an address/id prefix: keep glued ("addr1...")
      return prev + chunk;
    }
    return prev + " " + chunk;
  }

  // 5. Digit -> letter (e.g. "5 blocks") => add space.
  if (isDigit(lastChar) && isLetter(firstChar)) {
    return prev + " " + chunk;
  }

  // 6. For all other cases (including letter-letter and digit-digit),
  //    don't guess: just concatenate.
  return prev + chunk;
}

// ------------ LandingPage ---------------------------------------------------

export default function LandingPage() {
  const NL_ENDPOINT = import.meta.env.VITE_NL_ENDPOINT || "/api/v1/nl/query";

  const outlet = useOutletContext() || {};
  const { session, showToast } = outlet;
  const { authFetch } = useAuthRequest({ session, showToast });
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [topQueries, setTopQueries] = useState([
    { query: "List the latest 5 blocks." },
    {
      query: "Plot a bar chart showing monthly multi assets created in 2021.",
    },
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages]);

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

  // --- SSE Handlers ---------------------------------------------------------

  const handleStatus = useCallback(
    (text) => {
      if (!text) return;
      if (!statusMsgIdRef.current) {
        statusMsgIdRef.current = addMessage("status", text);
      } else {
        updateMessage(statusMsgIdRef.current, {
          content: text,
        });
      }
    },
    [addMessage, updateMessage]
  );

  const handleChunk = useCallback((raw) => {
    const chunk = sanitizeChunk(raw);
    if (!chunk) return;

    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];

      if (last && last.type === "assistant" && last.streaming) {
        last.content = appendChunkSmart(last.content || "", chunk);
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
  }, []);

  const handleDone = useCallback(() => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.type === "assistant" && last.streaming) {
        last.streaming = false;
        last.content = finalizeForRender(last.content || "");
      }
      return next;
    });

    if (statusMsgIdRef.current) {
      removeMessage(statusMsgIdRef.current);
      statusMsgIdRef.current = null;
    }

    setIsProcessing(false);
  }, [removeMessage]);

  const handleError = useCallback(
    (err) => {
      const msg =
        err?.message || "Unexpected error while processing your query.";
      addMessage("error", msg);
      setIsProcessing(false);
    },
    [addMessage]
  );

  const handleKVResults = useCallback(
    (kv) => {
      if (!kv || !kv.result_type) return;

      // Tables – only accept if it passes the validator
      if (kv.result_type === "table") {
        if (!isValidKVTable(kv)) {
          // Ignore bogus / empty table results
          return;
        }
        addMessage("table", "", { kv });
        return;
      }

      // Charts via shared kvCharts helpers
      const spec = kvToChartSpec(kv);
      if (!spec) return;

      addMessage("chart", "", {
        vegaSpec: spec,
        kvType: kv.result_type,
        isKV: true,
      });
    },
    [addMessage]
  );

  const { start, stop } = useLLMStream({
    fetcher: authFetch,
    onStatus: handleStatus,
    onChunk: handleChunk,
    onKVResults: handleKVResults,
    onDone: handleDone,
    onError: handleError,
  });

  // --- Top queries: refresh every 5 minutes --------------------
  const authFetchRef = useRef(null);

  // keep latest authFetch in a ref
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;

    async function loadTopQueries() {
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
        // silent; keep defaults
      }
    }

    // initial load + every 5 minutes
    loadTopQueries();
    const intervalId = setInterval(loadTopQueries, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []); // run once on mount

  // --- Send query -----------------------------------------------------------

  const sendQuery = useCallback(() => {
    const trimmed = (query || "").trim();
    if (!trimmed || isProcessing || !authFetch) return;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);
    setIsProcessing(true);

    statusMsgIdRef.current = addMessage(
      "status",
      "Planning the query and preparing SPARQL..."
    );

    start({
      url: NL_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: { query: trimmed },
    });
  }, [query, isProcessing, authFetch, addMessage, start, NL_ENDPOINT]);

  // Stop SSE when unmounting
  useEffect(
    () => () => {
      stop();
    },
    [stop]
  );

  const pinArtifact = useCallback(
    async (message) => {
      if (!authFetch) return;

      try {
        // Prevent pinning invalid / empty tables
        if (message.type === "table") {
          if (!message.kv || !isValidKVTable(message.kv)) {
            if (showToast) {
              showToast(
                "This table result is empty or invalid and cannot be pinned.",
                "warning"
              );
            }
            return;
          }
        }

        // Find the last user query before this message (for context)
        const idx = messages.findIndex((m) => m.id === message.id);
        let sourceQuery;
        if (idx > 0) {
          for (let i = idx - 1; i >= 0; i -= 1) {
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
            : {
                vegaSpec: message.vegaSpec,
                kvType: message.kvType,
              };

        const body = {
          artifact_type,
          title,
          source_query: sourceQuery,
          config,
        };

        const res = await authFetch("/api/v1/dashboard/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to pin artifact");
        }

        if (showToast) {
          // clickable toast → go straight to /dashboard
          showToast("Pinned to your dashboard (click to open).", "success", {
            onClick: () => navigate("/dashboard"),
          });
        }
      } catch (err) {
        console.error("Pin failed", err);
        if (showToast) {
          showToast("Could not pin artifact.", "danger");
        }
      }
    },
    [authFetch, messages, showToast, navigate]
  );

  // --- Render -------------------------------
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
                          Pin to dashboard
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
                          Pin to dashboard
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
            <div
              className="empty-state"
              style={{
                height: 0,
                padding: 0,
              }}
            />

            <div className="input-wrapper">
              <div className="input-field">
                <textarea
                  value={query}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery(v);
                    setCharCount(v.length);
                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 200) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isProcessing && query.trim()) {
                        sendQuery();
                      }
                    }
                  }}
                  placeholder="Ask a question about Cardano..."
                  rows={2}
                  maxLength={1000}
                  disabled={isProcessing}
                />
                <div className="char-count">
                  <span>{charCount}</span>
                  /1000
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

// ---------------------- Message renderer ------------------------------------
function Message({ type, content }) {
  if (type === "status" && !String(content || "").trim()) return null;

  if (type === "status") {
    return (
      <div className="message status">
        <div className="message-avatar">…</div>
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
        <div className="message-bubble markdown-body">
          {isUser ? (
            <div className="fade-in">
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {content}
              </pre>
            </div>
          ) : (
            <div className="fade-in">
              <ReactMarkdown
                remarkPlugins={[
                  [remarkGfm],
                  [
                    remarkMath,
                    {
                      singleDollarTextMath: true,
                      strict: false,
                    },
                  ],
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
