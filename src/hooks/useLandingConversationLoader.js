// src/hooks/useLandingConversationLoader.js
import { useEffect, useRef, useState } from "react";
import {
  mergeById,
  injectArtifactsAfterMessage,
} from "@/utils/landingMessageOps";

export function useLandingConversationLoader({
  routeConversationId,
  authFetchRef,
  setMessages,
  setConversationTitle,
  showToast,
  t,
}) {
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const lastLoadedConversationIdRef = useRef(null);

  useEffect(() => {
    const id = routeConversationId ? Number(routeConversationId) : null;
    const fetchFn = authFetchRef?.current;

    if (!fetchFn) {
      // no fetcher yet, do nothing (don't wipe UI)
      setIsLoadingConversation(false);
      return;
    }

    if (!id) {
      // We're on "/" (new chat). Only clear if we *came from* a conversation route.
      if (lastLoadedConversationIdRef.current != null) {
        setMessages([]);
        lastLoadedConversationIdRef.current = null;
      }
      setIsLoadingConversation(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setIsLoadingConversation(true);

    (async () => {
      try {
        const res = await fetchFn(`/api/v1/conversations/${id}`, {
          signal: controller.signal,
        });
        if (!res?.ok) throw new Error("Failed to load conversation");

        const data = await res.json();
        if (cancelled) return;

        setConversationTitle?.(
          String(data?.title || data?.conversation?.title || "")
        );

        // Restore raw conversation messages (keep raw assistant markdown)
        const restoredMsgsRaw = (data?.messages || []).map((m) => {
          const msgIdNum = m?.id; // numeric id from backend
          const role = m?.role;
          const isUser = role === "user";

          return {
            id: `conv_${msgIdNum}`,
            conv_message_id: msgIdNum, // numeric anchor
            type: isUser ? "user" : "assistant",
            content: m?.content || "",
          };
        });

        // Replay typing for the LAST assistant message only
        let replayId = null;
        for (let i = restoredMsgsRaw.length - 1; i >= 0; i--) {
          if (restoredMsgsRaw[i].type === "assistant") {
            replayId = restoredMsgsRaw[i].id;
            break;
          }
        }

        const restoredMsgs = restoredMsgsRaw.map((m) =>
          m.id === replayId ? { ...m, replayTyping: true } : m
        );

        // Inject artifacts using conversation_message_id anchoring
        const restoredWithArtifacts = injectArtifactsAfterMessage(
          restoredMsgs,
          data?.artifacts || []
        );

        const prevLoadedId = lastLoadedConversationIdRef.current;
        const isNewConversationRoute = prevLoadedId !== id;

        if (isNewConversationRoute) {
          // Replace, but also ensure no client-side streaming placeholders leak across route swaps
          setMessages(restoredWithArtifacts);
          lastLoadedConversationIdRef.current = id;
        } else {
          // Merge, but first drop any live streaming assistant placeholders
          setMessages((prev) => {
            const cleanedPrev = prev.filter(
              (m) => !(m?.type === "assistant" && m?.streaming)
            );
            return mergeById(cleanedPrev, restoredWithArtifacts);
          });
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "AbortError") return;

        console.error("Error loading conversation", err);
        showToast?.(t("landing.loadConversationError"), "danger");
      } finally {
        if (!cancelled) setIsLoadingConversation(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    routeConversationId,
    authFetchRef,
    setMessages,
    setConversationTitle,
    showToast,
    t,
  ]);

  return { isLoadingConversation };
}
