// src/components/landing/TopQueries.jsx
import React from "react";

export default function TopQueries({
  title,
  topQueries = [],
  isProcessing = false,
  onSelectQuery,
}) {
  return (
    <>
      <div className="empty-state-left">{title}</div>

      <div className="examples">
        {topQueries.map((q, i) => (
          <button
            key={`${q.query}-${i}`}
            className={`example-chip ${isProcessing ? "disabled" : ""}`}
            title={q.frequency ? `Asked ${q.frequency} times` : undefined}
            onClick={() => {
              if (!isProcessing) onSelectQuery?.(q);
            }}
          >
            {q.query}
          </button>
        ))}
      </div>
    </>
  );
}
