// src/hooks/useLandingMessages.js
import { useCallback, useRef, useState } from "react";
import { appendChunkSmart } from "@/utils/landingMessageOps";
import { finalizeForRender } from "@/utils/streamSanitizers";

export function useLandingMessages() {
  const [messages, setMessages] = useState([]);
  const streamingAssistantIdRef = useRef(null);
  const pendingStatusRef = useRef("");
  const ensuringRef = useRef(false);

  const ensureStreamingAssistant = useCallback((initial = {}) => {
    console.count("ensureStreamingAssistant setMessages");

    if (ensuringRef.current) return;
    ensuringRef.current = true;

    queueMicrotask(() => {
      ensuringRef.current = false;
    });

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];

      // 1) Prefer the tracked streaming assistant id, if it still exists and is streaming
      const sid = streamingAssistantIdRef.current;
      if (sid) {
        const idx = next.findIndex((m) => m?.id === sid);
        if (
          idx >= 0 &&
          next[idx]?.type === "assistant" &&
          next[idx]?.streaming
        ) {
          return prev;
        }
      }

      // 2) Fallback: find the most recent streaming assistant anywhere in the list
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i]?.type === "assistant" && next[i]?.streaming) {
          streamingAssistantIdRef.current = next[i].id;
          return prev;
        }
      }

      // 3) Otherwise, create a new streaming assistant exactly once
      const id = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamingAssistantIdRef.current = id;

      const pendingStatus = String(pendingStatusRef.current || "").trim();
      pendingStatusRef.current = "";

      next.push({
        id,
        type: "assistant",
        content: "",
        streaming: true,
        statusText: pendingStatus || "",
        ...initial,
      });

      return next;
    });
  }, []);

  const addMessage = useCallback((type, content, extra = {}) => {
    const id =
      extra.id ||
      `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const insertBeforeStreamingAssistant =
      extra.insertBeforeStreamingAssistant === true;

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];
      const msg = { id, type, content, ...extra };

      if (!insertBeforeStreamingAssistant) {
        next.push(msg);
        return next;
      }

      const sid = streamingAssistantIdRef.current;
      if (!sid) {
        next.push(msg);
        return next;
      }

      const sidx = next.findIndex((m) => m.id === sid && m.streaming);
      if (sidx < 0) {
        next.push(msg);
        return next;
      }

      // Insert artifact right BEFORE streaming assistant so all assistant text/status stays after it
      next.splice(sidx, 0, msg);
      return next;
    });

    return id;
  }, []);

  const updateMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }, []);

  const removeMessage = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const upsertStatus = useCallback((text) => {
    console.count("upsertStatus setMessages");

    if (!text) return;

    setMessages((prev) => {
      const next = [...prev];
      const sid = streamingAssistantIdRef.current;

      // Prefer ref target (if valid)
      let idx = sid != null ? next.findIndex((m) => m.id === sid) : -1;

      const okRefTarget =
        idx >= 0 && next[idx]?.type === "assistant" && next[idx]?.streaming;

      if (!okRefTarget) {
        // Fallback: last streaming assistant in the list
        idx = -1;
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i]?.type === "assistant" && next[i]?.streaming) {
            idx = i;
            break;
          }
        }
      }

      if (idx >= 0) {
        streamingAssistantIdRef.current = next[idx].id;
        next[idx] = { ...next[idx], statusText: text };
        return next;
      }

      // If we *expect* a streaming assistant to exist (sid is set) but it's not in the array yet,
      // buffer the status deterministically and let ensureStreamingAssistant consume it.
      if (sid) {
        pendingStatusRef.current = text;
        return next;
      }

      // Otherwise, no sid and no streaming assistant exists => buffer + create one next tick
      pendingStatusRef.current = text;
      return next;
    });
  }, []);

  const appendAssistantChunk = useCallback((chunk) => {
    console.count("appendAssistantChunk setMessages");

    if (!chunk) return;

    setMessages((prev) => {
      const next = [...prev];
      const sid = streamingAssistantIdRef.current;

      // Try the tracked id first
      let idx = sid ? next.findIndex((m) => m.id === sid) : -1;
      const ok =
        idx >= 0 && next[idx]?.type === "assistant" && next[idx]?.streaming;

      // Deterministic fallback: last streaming assistant
      if (!ok) {
        idx = -1;
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i]?.type === "assistant" && next[i]?.streaming) {
            idx = i;
            break;
          }
        }
      }

      if (idx >= 0) {
        const nextContent = appendChunkSmart(next[idx].content || "", chunk);
        if (nextContent === next[idx].content) return prev;
        next[idx] = { ...next[idx], content: nextContent };
        streamingAssistantIdRef.current = next[idx].id;
        return next;
      }

      // Only if none exists at all, create one
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
      prev.map((m) => {
        // If we know the active streaming id, only finalize that one.
        if (targetId) {
          if (m.id !== targetId) return m;
          return {
            ...m,
            streaming: false,
            statusText: "",
            content: finalizeForRender(m.content || ""),
          };
        }

        // Fallback: no active id tracked -> finalize ANY streaming assistant
        if (m?.type === "assistant" && m.streaming) {
          return {
            ...m,
            streaming: false,
            statusText: "",
            content: finalizeForRender(m.content || ""),
          };
        }

        return m;
      }),
    );

    streamingAssistantIdRef.current = null;
    pendingStatusRef.current = "";
  }, []);

  const dropAllStreamingAssistants = useCallback(() => {
    setMessages((prev) =>
      prev.filter((m) => !(m?.type === "assistant" && m?.streaming)),
    );
  }, []);

  const clearStatus = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type !== "assistant") return m;
        if (!String(m.statusText || "").trim()) return m;
        return { ...m, statusText: "" };
      }),
    );
  }, []);

  const resetStreamRefs = useCallback(() => {
    streamingAssistantIdRef.current = null;
    pendingStatusRef.current = "";
  }, []);

  return {
    messages,
    setMessages,
    streamingAssistantIdRef,
    addMessage,
    updateMessage,
    removeMessage,
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    dropAllStreamingAssistants,
    resetStreamRefs,
    ensureStreamingAssistant,
  };
}
