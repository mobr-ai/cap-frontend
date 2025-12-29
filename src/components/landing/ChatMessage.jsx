// src/components/landing/ChatMessage.jsx
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

import { finalizeForRender } from "@/utils/streamSanitizers";

function ReplayTyping({ text, speedMs = 12, onDone }) {
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

  return <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{shown}</pre>;
}

function StreamingTypingText({ text, isTyping, speedMs = 25, className = "" }) {
  const [shown, setShown] = useState(isTyping ? "" : String(text || ""));

  const typingRef = useRef(false);
  const timerRef = useRef(null);
  const iRef = useRef(0);
  const targetRef = useRef(String(text || ""));

  // Always keep the target up to date (it grows as chunks arrive)
  useEffect(() => {
    targetRef.current = String(text || "");

    // If we're NOT typing, keep shown fully in sync
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
    // start/continue typing loop only while isTyping
    if (!isTyping) return;

    if (typingRef.current) return; // already running
    typingRef.current = true;

    // if we already had some content, continue from there
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

      // If target grows later, we'll keep the loop alive by checking again
      // but we don't want a hot loop; just poll lightly while streaming.
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
    // Intentionally do NOT depend on `text` here; we read it via targetRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTyping, speedMs]);

  return <div className={className}>{shown}</div>;
}

export default function ChatMessage({
  type,
  content,
  streaming = false,
  replayTyping = false,
}) {
  const [replayDone, setReplayDone] = useState(false);

  useEffect(() => {
    // reset when message changes
    setReplayDone(false);
  }, [replayTyping, content]);

  const { t } = useTranslation();
  if (type === "status" && !String(content || "").trim()) return null;

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
            <div
              className={`rm-chat ${
                streaming || replayTyping ? "typing-mode" : "fade-in"
              }`}
            >
              {streaming ? (
                <div className="fade-in">
                  {renderMarkdown(content || "", { streamingMode: true })}
                </div>
              ) : replayTyping && !replayDone ? (
                <ReplayTyping
                  text={content || ""}
                  speedMs={3}
                  onDone={() => setReplayDone(true)}
                />
              ) : (
                renderMarkdown(finalizeForRender(content || ""), {
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
