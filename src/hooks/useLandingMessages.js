// src/hooks/useLandingMessages.js
import { useCallback, useRef, useState } from "react";
import { appendChunkSmart } from "@/utils/landingMessageOps";
import { finalizeForRender } from "@/utils/streamSanitizers";

export function useLandingMessages() {
  const [messages, setMessages] = useState([]);

  const streamingAssistantIdRef = useRef(null);

  const ensureStreamingAssistant = useCallback((initial = {}) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];

      if (last && last.type === "assistant" && last.streaming) {
        return next;
      }

      const id = `assistant_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      streamingAssistantIdRef.current = id;

      next.push({
        id,
        type: "assistant",
        content: "",
        streaming: true,
        statusText: "",
        ...initial,
      });

      return next;
    });
  }, []);

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

  const upsertStatus = useCallback((text) => {
    if (!text) return;

    setMessages((prev) => {
      const next = [...prev];
      const idx = next.findIndex(
        (m) => m.id === streamingAssistantIdRef.current
      );

      if (idx >= 0 && next[idx]?.type === "assistant" && next[idx]?.streaming) {
        next[idx] = { ...next[idx], statusText: text };
        return next;
      }

      // If no streaming assistant exists yet, create one and set status
      const id = `assistant_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;

      streamingAssistantIdRef.current = id;

      next.push({
        id,
        type: "assistant",
        content: "",
        streaming: true,
        statusText: text,
      });

      return next;
    });
  }, []);

  const appendAssistantChunk = useCallback((chunk) => {
    if (!chunk) return;

    setMessages((prev) => {
      const next = [...prev];

      const currentId = streamingAssistantIdRef.current;
      const idx =
        currentId != null ? next.findIndex((m) => m.id === currentId) : -1;

      // If we already have an active streaming assistant (anywhere in the list),
      // always append into THAT message (even if kv/table messages were inserted after it).
      if (idx >= 0 && next[idx]?.type === "assistant" && next[idx]?.streaming) {
        next[idx] = {
          ...next[idx],
          content: appendChunkSmart(next[idx].content || "", chunk),
        };
        return next;
      }

      // Otherwise create a new streaming assistant
      const id = `assistant_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      streamingAssistantIdRef.current = id;

      next.push({
        id,
        type: "assistant",
        content: chunk,
        streaming: true,
        statusText: "",
      });

      return next;
    });
  }, []);

  const finalizeStreamingAssistant = useCallback(() => {
    const targetId = streamingAssistantIdRef.current;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetId
          ? {
              ...m,
              streaming: false,
              statusText: "",
              content: finalizeForRender(m.content || ""),
            }
          : m
      )
    );

    streamingAssistantIdRef.current = null;
  }, []);

  const dropAllStreamingAssistants = useCallback(() => {
    setMessages((prev) =>
      prev.filter((m) => !(m?.type === "assistant" && m?.streaming))
    );
  }, []);

  const clearStatus = useCallback(() => {
    const targetId = streamingAssistantIdRef.current;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.type !== "assistant") return m;

        const hasStatus = !!String(m.statusText || "").trim();
        if (!hasStatus) return m;

        // Clear if it's the active streaming assistant OR if it's stale (not streaming anymore)
        if (m.id === targetId || !m.streaming) {
          return { ...m, statusText: "" };
        }

        return m;
      })
    );
  }, []);

  const resetStreamRefs = useCallback(() => {
    streamingAssistantIdRef.current = null;
  }, []);

  return {
    messages,
    setMessages,

    // refs (LandingPage still may need them)
    streamingAssistantIdRef,

    // ops
    addMessage,
    updateMessage,
    removeMessage,

    // stream helpers
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    dropAllStreamingAssistants,
    resetStreamRefs,
    ensureStreamingAssistant,
  };
}
