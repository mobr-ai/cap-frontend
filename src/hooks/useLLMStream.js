// src/hooks/useLLMStream.js
import { useCallback, useRef } from "react";

/**
 * Streaming SSE reader compatible with CAP:
 * - Handles "status:" lines
 * - Handles "data: ..." frames
 * - Handles plain, non-prefixed content lines
 * - Detects [DONE] with or without "data:" prefix
 * - Parses `kv_results:{...} ... _kv_results_end_` blocks
 *
 * Whitespace rules:
 * - Control lines are matched against a trimmed view.
 * - For "data:" frames we remove at most one protocol space after "data:"
 *   but preserve any additional spaces in the payload.
 * - For plain content lines we forward the original line (no trimStart),
 *   so model-inserted spaces between tokens are kept.
 */

export function useLLMStream({
  fetcher,
  onStatus,
  onChunk,
  onKVResults,
  onDone,
  onError,
} = {}) {
  const abortRef = useRef(null);

  const start = useCallback(
    async ({ url = "/query", body, method = "POST", headers = {} } = {}) => {
      if (!fetcher) {
        throw new Error("useLLMStream: fetcher (authFetch) is required.");
      }

      // Abort any previous stream
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetcher(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = new Error(
            `Streaming request failed: ${response.status} ${response.statusText}`
          );
          onError?.(err);
          return;
        }

        if (!response.body || !response.body.getReader) {
          const text = await response.text();
          if (text) onChunk?.(text);
          onDone?.();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        // kv_results capture mode
        let inKVBlock = false;
        let kvBuffer = "";

        const flushKVResults = () => {
          let raw = kvBuffer.trim();
          kvBuffer = "";
          if (!raw) return;

          try {
            // some models may accidentally prefix "kv_results:" inside the block; strip if present
            if (raw.startsWith("kv_results:")) {
              raw = raw.slice("kv_results:".length).trim();
            }

            // try direct parse
            return onKVResults?.(JSON.parse(raw));
          } catch (err) {
            // try to rescue by extracting the first {...} block
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                onKVResults?.(JSON.parse(match[0]));
                return;
              } catch (err2) {
                console.error(
                  "useLLMStream: kv_results JSON rescue failed",
                  err2,
                  match[0]
                );
              }
            }

            console.error("useLLMStream: failed to parse kv_results", err, raw);
            onError?.(err);
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (let rawLine of lines) {
            // Strip possible trailing \r but otherwise keep as-is for payload
            if (rawLine.endsWith("\r")) {
              rawLine = rawLine.slice(0, -1);
            }

            const trimmed = rawLine.trim();

            // Skip purely empty lines
            if (!trimmed) {
              // still, if we were in KV block this is just whitespace inside JSON
              if (inKVBlock) {
                kvBuffer += "\n";
              }
              continue;
            }

            // ----- End-of-stream markers -----
            if (
              trimmed === "[DONE]" ||
              trimmed === "data:[DONE]" ||
              trimmed === "data: [DONE]"
            ) {
              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }
              onDone?.();
              return;
            }

            // ----- Status lines -----
            if (trimmed.startsWith("status:")) {
              const status = trimmed.slice("status:".length).trim();
              if (status) onStatus?.(status);
              continue;
            }

            // ----- Start of kv_results block -----
            if (trimmed.startsWith("kv_results:")) {
              inKVBlock = true;
              kvBuffer = "";

              // Capture JSON that may begin on the same line after "kv_results:"
              const idx = rawLine.indexOf("kv_results:") + "kv_results:".length;
              const rest = rawLine.slice(idx).trim();
              if (rest && !rest.startsWith("_kv_results_end_")) {
                kvBuffer += rest + "\n";
              }
              continue;
            }

            // ----- Inside kv_results block -----
            if (inKVBlock) {
              if (trimmed.includes("_kv_results_end_")) {
                inKVBlock = false;
                flushKVResults();
              } else {
                kvBuffer += rawLine + "\n";
              }
              continue;
            }

            // ----- Standard SSE data frame -----
            if (trimmed.startsWith("data:")) {
              // Use the original rawLine to avoid losing meaningful spaces.
              const idx = rawLine.indexOf("data:") + "data:".length;
              let data = rawLine.slice(idx);

              // Remove a single protocol space if present, but keep any extra.
              if (data.startsWith(" ")) {
                data = data.slice(1);
              }

              const payload = data;
              if (!payload || payload === "[DONE]") continue;

              onChunk?.(payload);
              continue;
            }

            // ----- Fallback: treat as plain content chunk -----
            // Use the original rawLine (no trimStart) so leading spaces between tokens are preserved.
            onChunk?.(rawLine);
          }
        }

        // EOF without explicit [DONE]
        if (inKVBlock) {
          inKVBlock = false;
          flushKVResults();
        }
        onDone?.();
      } catch (err) {
        if (abortRef.current?.signal?.aborted) {
          return;
        }
        onError?.(err);
      }
    },
    [fetcher, onStatus, onChunk, onKVResults, onDone, onError]
  );

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return { start, stop };
}
