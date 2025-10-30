// src/hooks/useLLMStream.js
import { useCallback, useRef } from "react";

/**
 * Streaming SSE reader compatible with CAP:
 * - Handles "status:" lines
 * - Handles "data: ..." frames
 * - Also handles plain, non-prefixed content lines
 * - Detects [DONE] with or without "data:" prefix
 *
 * Pass your authenticated fetcher (authFetch) so cookies/headers are preserved.
 *
 * Example:
 * const { start, stop } = useLLMStream({
 *   fetcher: authFetchRef.current,
 *   onStatus, onChunk, onDone, onError
 * });
 *
 * start("/api/v1/nl/query", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ query }),
 *   credentials: "include"
 * });
 */
export function useLLMStream({
  fetcher,
  onStatus,
  onChunk,
  onDone,
  onError,
}) {
  const abortRef = useRef(null);

  const start = useCallback(async (url, fetchOpts = {}) => {
    // Abort previous stream
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (typeof fetcher !== "function") {
        throw new Error("useLLMStream: fetcher is required (pass authFetch).");
      }

      const mergedHeaders = {
        Accept: "text/event-stream",
        ...(fetchOpts.headers || {}),
      };

      const res = await fetcher(url, {
        ...fetchOpts,
        headers: mergedHeaders,
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let pending = ""; // partial line buffer

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        pending += decoder.decode(value, { stream: true });

        // Split by lines; keep tail in buffer
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";

        for (let rawLine of lines) {
          // Keep trailing spaces but normalize CR
          if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1);
          const line = rawLine; // no trimStart to preserve leading spaces in payload

          if (!line) continue;

          // 1) Explicit status lines
          if (line.startsWith("status:")) {
            onStatus?.(line.slice(7).trim());
            continue;
          }

          // 2) Proper SSE "data:" frames
          if (line.startsWith("data:")) {
            const payload = line.slice(5).trimStart();
            if (payload === "[DONE]") {
              onDone?.();
            } else {
              onChunk?.(payload);
            }
            continue;
          }

          // 3) Compatibility: treat any other non-empty line as data
          //    (your backend streams plain lines for the content)
          const x = line.trim();
          if (x === "[DONE]") {
            onDone?.();
            continue;
          }
          if (
            !line.startsWith("event:") &&
            !line.startsWith("id:") &&
            !line.startsWith("retry:")
          ) {
            onChunk?.(line);
          }
        }
      }

      // Flush any left-over as a final chunk
      if (pending.trim() && pending.trim() !== "[DONE]") {
        // If it's a truncated line, still deliver it
        onChunk?.(pending);
      }

      onDone?.();
    } catch (err) {
      if (abortRef.current?.signal?.aborted) return;
      onError?.(err);
    }
  }, [fetcher, onStatus, onChunk, onDone, onError]);

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { start, stop };
}
