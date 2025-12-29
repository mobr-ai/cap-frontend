// src/hooks/useLandingMessages.js
import { useCallback, useRef, useState } from "react";
import { appendChunkSmart } from "@/utils/landingMessageOps";
import { finalizeForRender } from "@/utils/streamSanitizers";

export function useLandingMessages() {
  const [messages, setMessages] = useState([]);

  const streamingAssistantIdRef = useRef(null);
  const statusMsgIdRef = useRef(null);

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

  const upsertStatus = useCallback(
    (text) => {
      if (!text) return;

      if (!statusMsgIdRef.current) {
        statusMsgIdRef.current = addMessage("status", text);
      } else {
        updateMessage(statusMsgIdRef.current, { content: text });
      }
    },
    [addMessage, updateMessage]
  );

  const appendAssistantChunk = useCallback((chunk) => {
    if (!chunk) return;

    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];

      if (last && last.type === "assistant" && last.streaming) {
        next[next.length - 1] = {
          ...last,
          content: appendChunkSmart(last.content || "", chunk),
        };
      } else {
        const id = `assistant_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 6)}`;
        streamingAssistantIdRef.current = id;

        next.push({
          id,
          type: "assistant",
          content: chunk,
          streaming: true,
        });
      }
      return next;
    });
  }, []);

  const finalizeStreamingAssistant = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === streamingAssistantIdRef.current && m.streaming
          ? {
              ...m,
              streaming: false,
              content: finalizeForRender(m.content || ""),
            }
          : m
      )
    );
    streamingAssistantIdRef.current = null;
  }, []);

  const clearStatus = useCallback(() => {
    if (statusMsgIdRef.current) {
      removeMessage(statusMsgIdRef.current);
      statusMsgIdRef.current = null;
    }
  }, [removeMessage]);

  const resetStreamRefs = useCallback(() => {
    streamingAssistantIdRef.current = null;
    statusMsgIdRef.current = null;
  }, []);

  return {
    messages,
    setMessages,

    // refs (LandingPage still may need them)
    streamingAssistantIdRef,
    statusMsgIdRef,

    // ops
    addMessage,
    updateMessage,
    removeMessage,

    // stream helpers
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    resetStreamRefs,
  };
}
