// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

import { useAuthRequest } from "../hooks/useAuthRequest";
import { useLLMStream } from "../hooks/useLLMStream";
import { sanitizeChunk, finalizeForRender } from "../utils/streamSanitizers";
import "../styles/LandingPage.css";

// ------------ Vega helpers --------------------------------------------------

// Lazy Vega-Lite renderer with graceful fallback
function VegaChart({ spec }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!spec || !containerRef.current) return;

    let cancelled = false;
    let view = null;

    async function render() {
      try {
        const mod = await import("vega-embed");
        const embed = mod.default || mod;
        if (cancelled) return;
        const result = await embed(containerRef.current, spec, {
          actions: false,
        });
        view = result.view;
      } catch (err) {
        if (!cancelled) {
          setError(
            "Unable to render chart visualization. Please refer to the textual explanation."
          );
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (view) {
        try {
          view.finalize();
        } catch {
          // ignore
        }
      }
    };
  }, [spec]);

  if (error) {
    return <div className="vega-chart-error">{error}</div>;
  }

  return <div className="vega-chart-container" ref={containerRef} />;
}

// kv_results → Markdown table
function kvTableToMarkdown(kv) {
  const cols = kv?.data?.values || [];
  if (!Array.isArray(cols) || cols.length === 0) return "";

  let headers =
    (kv.metadata &&
      Array.isArray(kv.metadata.columns) &&
      kv.metadata.columns.length &&
      kv.metadata.columns) ||
    cols
      .map((col) => {
        const entry = Object.entries(col).find(([key]) => key !== "values");
        return entry ? entry[1] : "";
      })
      .filter(Boolean);

  if (!headers.length) return "";

  const colValues = cols.map((c) => c.values || []);
  const rowCount = Math.max(
    ...colValues.map((vs) => (Array.isArray(vs) ? vs.length : 0))
  );
  if (!rowCount || !isFinite(rowCount)) return "";

  let md = `| ${headers.join(" | ")} |\n`;
  md += `| ${headers.map(() => "---").join(" | ")} |\n`;
  for (let i = 0; i < rowCount; i++) {
    const row = colValues.map((vs) =>
      i < vs.length && vs[i] != null ? String(vs[i]) : ""
    );
    md += `| ${row.join(" | ")} |\n`;
  }
  return md;
}

// kv_results → Vega-Lite bar chart
function kvToBarChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const sample = values[0];
  const keys = Object.keys(sample);
  const xField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const yFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("amount")) ||
    keys.find((k) => k.toLowerCase().includes("value"));
  const yField = yFieldCandidate || keys[1] || keys[0];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bar chart from kv_results",
    data: { values },
    mark: "bar",
    encoding: {
      x: { field: xField, type: "ordinal", title: xField },
      y: { field: yField, type: "quantitative", title: yField },
      tooltip: [
        { field: xField, type: "ordinal" },
        { field: yField, type: "quantitative" },
      ],
    },
  };
}

// kv_results → Vega-Lite pie chart
function kvToPieChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const sample = values[0];
  const keys = Object.keys(sample);
  const catField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const valFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("value")) ||
    keys.find((k) => k.toLowerCase().includes("amount"));
  const valField = valFieldCandidate || keys[1] || keys[0];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Pie chart from kv_results",
    data: { values },
    mark: "arc",
    encoding: {
      theta: { field: valField, type: "quantitative" },
      color: {
        field: catField,
        type: "nominal",
        legend: { title: null },
      },
      tooltip: [
        { field: catField, type: "nominal" },
        { field: valField, type: "quantitative" },
      ],
    },
    view: { stroke: null },
  };
}

// kv_results → Vega-Lite line chart
function kvToLineChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const colNames = kv?.metadata?.columns || [];
  const seriesNameFor = (c) => {
    if (colNames.length >= 3) {
      const idx = Number(c);
      if (!Number.isNaN(idx) && idx + 1 < colNames.length) {
        return colNames[idx + 1];
      }
    }
    return `series_${c}`;
  };

  const prepared = values.map((row) => {
    const series =
      row.series != null
        ? row.series
        : row.c != null
        ? seriesNameFor(row.c)
        : "series";
    return {
      x: row.x,
      y: row.y,
      series,
    };
  });

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Line chart from kv_results",
    data: { values: prepared },
    mark: "line",
    encoding: {
      x: {
        field: "x",
        type: "temporal",
        title: colNames[0] || "x",
      },
      y: {
        field: "y",
        type: "quantitative",
        title: "value",
      },
      color: {
        field: "series",
        type: "nominal",
        title: "Series",
      },
      tooltip: [
        { field: "x", type: "temporal" },
        { field: "series", type: "nominal" },
        { field: "y", type: "quantitative" },
      ],
    },
  };
}

function kvToChartSpec(kv) {
  if (!kv || !kv.result_type) return null;
  switch (kv.result_type) {
    case "bar_chart":
      return kvToBarChartSpec(kv);
    case "pie_chart":
      return kvToPieChartSpec(kv);
    case "line_chart":
      return kvToLineChartSpec(kv);
    default:
      return null;
  }
}

// Interactive KV Table Component
function KVTable({ kv }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const columns = (kv?.metadata?.columns || []).filter(Boolean);
  const cols = kv?.data?.values || [];
  if (!columns.length || !cols.length) return null;

  const formatValue = (key, value) => {
    if (value === null || value === undefined) return "";
    const raw = String(value).trim();
    if (!raw) return "";

    // numeric like "6146955.0" → "6146955"
    const n = Number(raw);
    if (!Number.isNaN(n)) {
      if (Number.isInteger(n)) return n.toString();
      return n.toString();
    }

    // ISO timestamp: keep as is for now
    if (!Number.isNaN(Date.parse(raw)) && /T\d{2}:\d{2}/.test(raw)) {
      return raw;
    }

    return raw;
  };

  const rows = [];
  const maxLen = Math.max(...cols.map((c) => c.values?.length || 0));
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    for (let c = 0; c < cols.length; c++) {
      const colKey = columns[c] || Object.keys(cols[c])[0];
      const val = cols[c].values?.[i];
      row[colKey] = formatValue(colKey, val);
    }
    rows.push(row);
  }

  const detectType = (v) => {
    if (v === "" || v == null) return "string";
    if (!isNaN(Number(v))) return "number";
    if (!isNaN(Date.parse(v))) return "date";
    return "string";
  };

  const handleSort = (key) => {
    if (key === sortKey) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedRows = React.useMemo(() => {
    if (!sortKey) return rows;
    const t = detectType(rows[0]?.[sortKey]);
    const copy = [...rows];

    copy.sort((a, b) => {
      const A = a[sortKey];
      const B = b[sortKey];
      if (t === "number") return Number(A) - Number(B);
      if (t === "date") return new Date(A) - new Date(B);
      return String(A).localeCompare(String(B));
    });

    return sortAsc ? copy : copy.reverse();
  }, [rows, sortKey, sortAsc]);

  return (
    <div className="kv-table-wrapper">
      <table className="kv-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className={
                  sortKey === col
                    ? sortAsc
                      ? "sorted-asc"
                      : "sorted-desc"
                    : ""
                }
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{row[col]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  const outlet = useOutletContext() || {};
  const { session, showToast } = outlet;
  const { authFetch } = useAuthRequest({ session, showToast });
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
        "Plot a pie chart of how much the top 1% ADA holders represent of total supply.",
    },
  ]);

  const messagesEndRef = useRef(null);
  const statusMsgIdRef = useRef(null);

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
      console.log("KV RESULTS RECEIVED", kv); // debug

      if (!kv || !kv.result_type) return;

      if (kv.result_type === "table") {
        addMessage("table", "", { kv });
        return;
      }

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

  // --- Top queries: 5min interval --------------------

  useEffect(() => {
    let cancelled = false;

    async function loadTopQueries() {
      try {
        const res = await fetch("/api/v1/nl/queries/top?limit=5");
        if (!res.ok || cancelled) return;

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

    loadTopQueries();
    const intervalId = setInterval(loadTopQueries, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // --- Send query -----------------------------------------------------------

  const sendQuery = useCallback(() => {
    const trimmed = (query || "").trim();
    if (!trimmed || isProcessing) return;

    addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);
    setIsProcessing(true);

    statusMsgIdRef.current = addMessage(
      "status",
      "Planning the query and preparing SPARQL..."
    );

    start({
      url: "/api/v1/nl/query",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: { query: trimmed },
    });
  }, [query, isProcessing, addMessage, start]);

  useEffect(
    () => () => {
      stop();
    },
    [stop]
  );

  const pinArtifact = useCallback(
    async (message) => {
      if (!authFetch) {
        return;
      }

      try {
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
          showToast("Pinned to your dashboard.", "success");
        }
      } catch (err) {
        console.error("Pin failed", err);
        if (showToast) {
          showToast("Could not pin artifact.", "danger");
        }
      }
    },
    [authFetch, messages, showToast]
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
              ) : m.type === "table" && m.kv ? (
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
