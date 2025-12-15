// src/hooks/useLLMStream.js
import { useCallback, useRef } from "react";

export function useLLMStream({
  fetcher,
  onStatus,
  onChunk,
  onKVResults,
  onDone,
  onError,
  onMetadata,
} = {}) {
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
                // if we have a title candidate, include it to help sidebar display
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

          // IMPORTANT: emit "created" right away, so typing animation is visible
          emitCreatedIfNeeded();
        } catch (metaErr) {
          console.warn(
            "useLLMStream: failed to read metadata headers",
            metaErr
          );
        }
        // -----------------------------------

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
          let raw = kvBuffer.trim();
          kvBuffer = "";
          if (!raw) return;

          try {
            if (raw.startsWith("kv_results:")) {
              raw = raw.slice("kv_results:".length).trim();
            }
            onKVResults?.(JSON.parse(raw));
          } catch (err) {
            const match = raw.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                onKVResults?.(JSON.parse(match[0]));
                return;
              } catch {}
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
            if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1);
            const trimmed = rawLine.trim();

            if (!trimmed) {
              if (inKVBlock) kvBuffer += "\n";
              continue;
            }

            if (
              trimmed === "[DONE]" ||
              trimmed === "data:[DONE]" ||
              trimmed === "data: [DONE]"
            ) {
              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }
              // allow React to process KV insertions first
              queueMicrotask(() => completeOnce());
              return;
            }

            if (trimmed.startsWith("status:")) {
              const status = trimmed.slice("status:".length).trim();
              if (status) onStatus?.(status);
              continue;
            }

            if (trimmed.startsWith("kv_results:")) {
              inKVBlock = true;
              kvBuffer = "";

              const idx = rawLine.indexOf("kv_results:") + "kv_results:".length;
              const rest = rawLine.slice(idx).trim();
              if (rest && !rest.startsWith("_kv_results_end_")) {
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
              continue;
            }

            if (trimmed.startsWith("data:")) {
              const idx = rawLine.indexOf("data:") + "data:".length;
              let data = rawLine.slice(idx);
              if (data.startsWith(" ")) data = data.slice(1);

              const payload = data;
              if (!payload || payload === "[DONE]") continue;

              onChunk?.(payload);
              continue;
            }

            onChunk?.(rawLine);
          }
        }

        if (inKVBlock) {
          inKVBlock = false;
          flushKVResults();
        }

        // EOF without [DONE]
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
