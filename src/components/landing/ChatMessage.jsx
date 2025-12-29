// src/components/landing/ChatMessage.jsx
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

function ReplayTyping({ text, speedMs = 12, onDone, renderMarkdown }) {
  const FULL = String(text || "");
  const [shown, setShown] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    setShown("");
    if (!FULL) {
      onDone?.();
      return;
    }

    let i = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      i += 1;
      setShown(FULL.slice(0, i));

      if (i < FULL.length) {
        timerRef.current = window.setTimeout(tick, speedMs);
      } else {
        timerRef.current = null;
        onDone?.();
      }
    };

    timerRef.current = window.setTimeout(tick, speedMs);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [FULL, speedMs, onDone]);

  // Critical: use the same markdown renderer so layout & sizing match streaming/final.
  return renderMarkdown ? renderMarkdown(shown, { streamingMode: true }) : null;
}

function StreamingTypingText({ text, isTyping, speedMs = 25, className = "" }) {
  const [shown, setShown] = useState(isTyping ? "" : String(text || ""));

  const typingRef = useRef(false);
  const timerRef = useRef(null);
  const iRef = useRef(0);
  const targetRef = useRef(String(text || ""));

  useEffect(() => {
    targetRef.current = String(text || "");

    if (!isTyping) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      typingRef.current = false;
      iRef.current = targetRef.current.length;
      setShown(targetRef.current);
    }
  }, [text, isTyping]);

  useEffect(() => {
    if (!isTyping) return;

    if (typingRef.current) return;
    typingRef.current = true;

    const currentShownLen = (shown || "").length;
    if (iRef.current < currentShownLen) iRef.current = currentShownLen;

    const tick = () => {
      const target = targetRef.current;

      if (iRef.current < target.length) {
        iRef.current += 1;
        setShown(target.slice(0, iRef.current));
        timerRef.current = window.setTimeout(tick, speedMs);
        return;
      }

      timerRef.current = window.setTimeout(tick, Math.max(40, speedMs));
    };

    timerRef.current = window.setTimeout(tick, speedMs);

    return () => {
      typingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, speedMs]);

  return <div className={className}>{shown}</div>;
}

export default function ChatMessage({
  type,
  content,
  streaming = false,
  replayTyping = false,
  statusText = "",
}) {
  const [replayDone, setReplayDone] = useState(false);

  useEffect(() => {
    setReplayDone(false);
  }, [replayTyping, content]);

  const { t } = useTranslation();

  if (type === "error") {
    return <div className="error-message">{content}</div>;
  }

  const isUser = type === "user";
  const assistantHasText = String(content || "").trim().length > 0;

  // Hide empty non-streaming assistant placeholders (common in convo history).
  // Keep streaming empty assistant visible (it shows the thinking UI).
  if (!isUser && type !== "error" && !streaming && !assistantHasText) {
    return null;
  }

  const renderMarkdown = (md, { streamingMode = false } = {}) => {
    const text =
      typeof md === "string"
        ? md
        : md == null
        ? ""
        : typeof md === "number" || typeof md === "boolean"
        ? String(md)
        : md?.toString?.()
        ? String(md)
        : "";

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: true, strict: false }],
        ]}
        rehypePlugins={
          streamingMode
            ? [
                rehypeKatex,
                // keep streaming light: no highlight while typing
              ]
            : [rehypeKatex, [rehypeHighlight, { ignoreMissing: true }]]
        }
        components={{
          h1: ({ node, ...props }) => <h3 {...props} />,
          h2: ({ node, ...props }) => <h4 {...props} />,
          h3: ({ node, ...props }) => <h5 {...props} />,
          h4: ({ node, ...props }) => <h6 {...props} />,
          p: ({ node, ...props }) => <p {...props} />,
          ul: ({ node, ...props }) => <ul {...props} />,
          ol: ({ node, ...props }) => <ol {...props} />,
          li: ({ node, ...props }) => <li {...props} />,
          a({ node, href, children, ...props }) {
            const isExternal =
              typeof href === "string" && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...props}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          code({ node, inline, className, children, ...props }) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre({ node, children, ...props }) {
            return (
              <pre {...props} className="rm-pre">
                {children}
              </pre>
            );
          },
          blockquote({ node, ...props }) {
            return <blockquote className="rm-quote" {...props} />;
          },
          table({ node, ...props }) {
            return (
              <div className="rm-table-wrap">
                <table {...props} />
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    );
  };

  const effectiveStatus =
    String(statusText || "").trim() || t("landing.defaultStatus");

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
            <div
              className={`rm-chat ${
                streaming || replayTyping ? "typing-mode" : "fade-in"
              }`}
            >
              {streaming && !assistantHasText ? (
                <div className="fade-in">
                  <span className="thinking-inline">
                    <span className="thinking-text">{effectiveStatus}</span>
                    <span className="thinking-animation">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                  </span>
                </div>
              ) : streaming ? (
                <div className="fade-in">
                  {renderMarkdown(content || "", { streamingMode: true })}
                </div>
              ) : replayTyping && !replayDone ? (
                <ReplayTyping
                  text={content || ""}
                  speedMs={3}
                  onDone={() => setReplayDone(true)}
                  renderMarkdown={renderMarkdown}
                />
              ) : (
                renderMarkdown(content || "", {
                  streamingMode: false,
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
