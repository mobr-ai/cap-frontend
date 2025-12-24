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
  const stripTrailingDataPrefix = (s) => s.replace(/data\s*:\s*$/i, "");

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

      const isDoneLine = (line) =>
        line === "[DONE]" || line === "data:[DONE]" || line === "data: [DONE]";

      // If "[DONE]" is split across stream chunks, prevent it from leaking to UI.
      // We buffer a short tail and only emit it once we're sure it's not part of "[DONE]".
      let doneCarry = "";

      // Returns { textToEmit, shouldHoldTail } behavior via doneCarry updates.
      const emitText = (text) => {
        if (!text) return;

        // Combine with any carry from previous payload
        let combined = doneCarry + text;
        doneCarry = "";

        // If the combined contains DONE, strip and stop upstream caller should complete.
        // (Caller still handles completion; this is just a final safety net.)
        const idx = combined.indexOf("[DONE]");
        if (idx !== -1) {
          const before = stripTrailingDataPrefix(combined.slice(0, idx));
          if (before) onChunk?.(before);
          // Do not emit anything after DONE
          return { hitDone: true };
        }

        // If combined ends with a prefix of "[DONE]" (split token), hold it.
        // Keep at most 5 chars (length of "[DONE" is 5, plus "[" cases).
        const holdCandidates = ["[", "[D", "[DO", "[DON", "[DONE"];
        for (const c of holdCandidates) {
          if (combined.endsWith(c)) {
            doneCarry = c;
            const safe = combined.slice(0, -c.length);
            if (safe) onChunk?.(safe);
            return { hitDone: false };
          }
        }

        // Normal emit
        onChunk?.(combined);
        return { hitDone: false };
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
          if (text) emitText(text);
          // Flush any pending carry (safe to emit if not part of DONE)
          if (doneCarry) {
            onChunk?.(doneCarry);
            doneCarry = "";
          }
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

            // "trimmed" keeps content spacing; "proto" tolerates leading whitespace for protocol parsing
            const trimmed = rawLine.replace(/\r$/, "");
            const proto = trimmed.trimStart();

            // HARD STOP: DONE marker may be concatenated into a non-SSE line
            // Example: "...activity.data: [DONE]"
            const donePos = proto.indexOf("[DONE]");
            if (donePos !== -1) {
              // Preserve original content spacing; proto is only for detection.
              let before = trimmed.slice(0, donePos);
              before = stripTrailingDataPrefix(before);

              if (before) {
                // If the line was a data line (e.g. "data: ...data: [DONE]"),
                // extract and emit the payload before completing.
                if (before.trimStart().startsWith("data:")) {
                  const payloadBeforeDone = extractDataPayload(
                    before.trimStart()
                  );
                  if (payloadBeforeDone) {
                    const r = emitText(payloadBeforeDone);
                    if (r.hitDone) {
                      if (inKVBlock) {
                        inKVBlock = false;
                        flushKVResults();
                      }
                      lastWasText = false;
                      queueMicrotask(() => completeOnce());
                      return;
                    }
                  }
                } else {
                  const r = emitText(before);
                  if (r.hitDone) {
                    if (inKVBlock) {
                      inKVBlock = false;
                      flushKVResults();
                    }
                    lastWasText = false;
                    queueMicrotask(() => completeOnce());
                    return;
                  }
                }
              }

              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }

              lastWasText = false;
              queueMicrotask(() => completeOnce());
              return;
            }

            // Bare SSE prefix split from payload (e.g. "data:" alone), possibly indented
            // Accept whitespace after "data:" because chunking may produce "data: " lines.
            if (/^data\s*:\s*$/.test(proto) || /^data\s*$/.test(proto)) {
              continue;
            }

            // keep-alive / blank line (possibly whitespace-only)
            if (!proto) {
              if (inKVBlock) {
                kvBuffer += "\n";
              } else if (lastWasText) {
                // IMPORTANT: do NOT emit "\n" (sanitizeChunk drops it)
                onChunk?.(NL_TOKEN);
              }
              continue;
            }

            if (isDoneLine(proto)) {
              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }
              lastWasText = false;
              queueMicrotask(() => completeOnce());
              return;
            }

            if (proto.startsWith("status:")) {
              const status = proto.slice("status:".length).trim();
              if (status) onStatus?.(status);
              lastWasText = false;
              continue;
            }

            if (proto.startsWith("kv_results:")) {
              inKVBlock = true;
              kvBuffer = "";
              lastWasText = false;

              const idx = proto.indexOf("kv_results:") + "kv_results:".length;
              const rest = proto.slice(idx);
              const restTrimmed = rest.trim();

              if (restTrimmed && !restTrimmed.startsWith("_kv_results_end_")) {
                kvBuffer += rest + "\n";
              }
              continue;
            }

            if (inKVBlock) {
              if (proto.includes("_kv_results_end_")) {
                inKVBlock = false;
                flushKVResults();
              } else {
                kvBuffer += trimmed + "\n";
              }
              lastWasText = false;
              continue;
            }

            // SSE data line (possibly indented)
            if (proto.startsWith("data:")) {
              const payload = extractDataPayload(proto);
              if (payload == null) continue;

              // Empty data line => newline sentinel
              if (payload === "") {
                onChunk?.(NL_TOKEN);
                lastWasText = true;
                continue;
              }

              // If DONE arrives as a data payload, never treat it as content.
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
              // Also protected by emitText() against split tokens.
              const doneIdx = payload.indexOf("[DONE]");
              if (doneIdx !== -1) {
                let before = payload.slice(0, doneIdx);
                before = stripTrailingDataPrefix(before);

                if (before) emitText(before);

                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                return;
              }

              const r = emitText(payload);
              if (r.hitDone) {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                return;
              }

              lastWasText = true;
              continue;
            }

            // Raw text lines fallback
            {
              const r = emitText(trimmed);
              if (r.hitDone) {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                return;
              }
              lastWasText = true;
            }
          }
        }

        if (inKVBlock) {
          inKVBlock = false;
          flushKVResults();
        }

        // Flush any pending carry that wasn't part of DONE
        if (doneCarry) {
          onChunk?.(doneCarry);
          doneCarry = "";
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
