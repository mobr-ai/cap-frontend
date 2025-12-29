// src/components/landing/ChatInput.jsx
import React from "react";

export default function ChatInput({
  query,
  setQuery,
  charCount,
  setCharCount,
  isProcessing = false,
  maxLength = 1000,
  placeholder,
  charCountText,
  processingLabel,
  sendLabel,
  onSend,
}) {
  return (
    <div className="input-wrapper">
      <div className="input-field">
        <textarea
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setCharCount(value.length);

            // Keep the same auto-grow behavior
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isProcessing && (query || "").trim()) onSend?.();
            }
          }}
          placeholder={placeholder}
          rows={2}
          maxLength={maxLength}
          disabled={isProcessing}
        />
        <div className="char-count">
          <span>{charCountText}</span>
        </div>
      </div>

      <button
        className={`send-button ${isProcessing ? "processing" : ""}`}
        disabled={isProcessing || !(query || "").trim()}
        onClick={() => {
          if (!isProcessing && (query || "").trim()) onSend?.();
        }}
      >
        <span>{isProcessing ? processingLabel : sendLabel}</span>
        <span>{isProcessing ? <div className="button-spinner" /> : "→"}</span>
      </button>
    </div>
  );
}
