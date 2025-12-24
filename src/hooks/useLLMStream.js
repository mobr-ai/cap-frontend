// src/hooks/useLLMStream.js
import { useCallback, useRef } from "react";

const NL_TOKEN = "__NL__";

export function useLLMStream({
  fetcher,
  onStatus,
  onChunk,
  onKVResults,
  onDone,
  onError,
  onMetadata,
} = {}) {
  let lastWasText = false;
  const abortRef = useRef(null);

  const start = useCallback(
    async ({
      url = VITE_NL_ENDPOINT,
      body,
      method = "POST",
      headers = {},
    } = {}) => {
      if (!fetcher) {
        throw new Error("useLLMStream: fetcher (authFetch) is required.");
      }

      const requestedConversationId =
        body?.conversation_id ?? body?.conversationId ?? null;
      const isNewConversation = !requestedConversationId;

      const streamMeta = { conversationId: null, userMessageId: null };
      let createdEventEmitted = false;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const rawTitleCandidate = String(body?.query || "").trim();
      const makeTitleCandidate = () => {
        let title = rawTitleCandidate;
        if (title.length > 80) title = title.slice(0, 77) + "...";
        return title || null;
      };

      const emitCreatedIfNeeded = () => {
        if (!isNewConversation) return;
        if (createdEventEmitted) return;
        const convId = streamMeta.conversationId;
        if (!convId) return;

        createdEventEmitted = true;

        window.dispatchEvent(
          new CustomEvent("cap:conversation-created", {
            detail: {
              conversation: {
                id: convId,
                title: makeTitleCandidate(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_message_preview: null,
                _justCreated: true,
                _localUpdatedAt: Date.now(),
              },
            },
          })
        );
      };

      const emitTouched = () => {
        const convId = streamMeta.conversationId;
        if (!convId) return;

        window.dispatchEvent(
          new CustomEvent("cap:conversation-touched", {
            detail: {
              conversation: {
                id: convId,
                updated_at: new Date().toISOString(),
                _localUpdatedAt: Date.now(),
                title: makeTitleCandidate(),
              },
            },
          })
        );
      };

      const completeOnce = () => {
        emitTouched();
        onDone?.({ ...streamMeta });
      };

      // SSE rule: payload for "data:" lines must preserve spacing.
      // Only remove ONE optional leading space after "data:".
      const extractDataPayload = (rawLine) => {
        const idx = rawLine.indexOf("data:");
        if (idx < 0) return null;
        let payload = rawLine.slice(idx + "data:".length);
        if (payload.startsWith(" ")) payload = payload.slice(1);
        return payload;
      };

      const isDoneLine = (trimmed) =>
        trimmed === "[DONE]" ||
        trimmed === "data:[DONE]" ||
        trimmed === "data: [DONE]";

      try {
        const response = await fetcher(url, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
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

        // ---- Read metadata headers EARLY ----
        try {
          const convIdHeader =
            response.headers.get("x-conversation-id") ||
            response.headers.get("X-Conversation-Id");
          const userMsgIdHeader =
            response.headers.get("x-user-message-id") ||
            response.headers.get("X-User-Message-Id");

          streamMeta.conversationId = convIdHeader
            ? Number(convIdHeader)
            : null;
          streamMeta.userMessageId = userMsgIdHeader
            ? Number(userMsgIdHeader)
            : null;

          if (streamMeta.conversationId || streamMeta.userMessageId) {
            onMetadata?.({ ...streamMeta });
          }

          emitCreatedIfNeeded();
        } catch (metaErr) {
          console.warn(
            "useLLMStream: failed to read metadata headers",
            metaErr
          );
        }
        // -----------------------------------

        // Non-streaming fallback
        if (!response.body || !response.body.getReader) {
          const text = await response.text();
          if (text) onChunk?.(text);
          completeOnce();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        let inKVBlock = false;
        let kvBuffer = "";

        const flushKVResults = () => {
          let raw = kvBuffer;
          kvBuffer = "";
          if (!raw) return;

          let s = String(raw);
          s = s.replace(/^\s+|\s+$/g, "");

          try {
            if (s.startsWith("kv_results:")) {
              s = s.slice("kv_results:".length).replace(/^\s+/, "");
            }
            onKVResults?.(JSON.parse(s));
          } catch (err) {
            const match = s.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                onKVResults?.(JSON.parse(match[0]));
                return;
              } catch {}
            }
            console.error("useLLMStream: failed to parse kv_results", err, s);
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
            if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1);

            const trimmed = rawLine.replace(/\r$/, "");

            // keep-alive / blank line
            if (!trimmed) {
              if (inKVBlock) {
                kvBuffer += "\n";
              } else if (lastWasText) {
                // IMPORTANT: do NOT emit "\n" (sanitizeChunk drops it)
                onChunk?.(NL_TOKEN);
              }
              continue;
            }

            if (isDoneLine(trimmed)) {
              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }
              lastWasText = false;
              queueMicrotask(() => completeOnce());
              return;
            }

            if (trimmed.startsWith("status:")) {
              const status = trimmed.slice("status:".length).trim();
              if (status) onStatus?.(status);
              lastWasText = false;
              continue;
            }

            if (trimmed.startsWith("kv_results:")) {
              inKVBlock = true;
              kvBuffer = "";
              lastWasText = false;

              const idx = rawLine.indexOf("kv_results:") + "kv_results:".length;
              const rest = rawLine.slice(idx);
              const restTrimmed = rest.trim();

              if (restTrimmed && !restTrimmed.startsWith("_kv_results_end_")) {
                kvBuffer += rest + "\n";
              }
              continue;
            }

            if (inKVBlock) {
              if (trimmed.includes("_kv_results_end_")) {
                inKVBlock = false;
                flushKVResults();
              } else {
                kvBuffer += rawLine + "\n";
              }
              lastWasText = false;
              continue;
            }

            // SSE data line
            if (trimmed.startsWith("data:")) {
              const payload = extractDataPayload(rawLine);

              if (payload == null) continue;

              // Empty data line => newline sentinel
              if (payload === "") {
                onChunk?.(NL_TOKEN);
                lastWasText = true;
                continue;
              }

              // If DONE arrives as a data payload (or is accidentally concatenated),
              // never treat it as content.
              if (payload === "[DONE]") {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                return;
              }

              // Defensive: if DONE is concatenated into the payload, strip and finish.
              const doneIdx = payload.indexOf("[DONE]");
              if (doneIdx !== -1) {
                const before = payload.slice(0, doneIdx);
                if (before) onChunk?.(before);
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                return;
              }

              onChunk?.(payload);
              lastWasText = true;
              continue;
            }

            // Raw text lines fallback
            onChunk?.(rawLine);
            lastWasText = true;
          }
        }

        if (inKVBlock) {
          inKVBlock = false;
          flushKVResults();
        }

        completeOnce();
      } catch (err) {
        if (abortRef.current?.signal?.aborted) return;
        onError?.(err);
      }
    },
    [fetcher, onStatus, onChunk, onKVResults, onDone, onError, onMetadata]
  );

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { start, stop };
}
