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
  setConversationOwnerId,
  showToast,
  t,
  mode = "user", // "user" | "admin"
}) {
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Conversation currently shown in the UI (only updated when we commit messages for that convo)
  const lastCommittedConversationIdRef = useRef(null);

  // A monotonic token that increments on each route conversation load.
  // Used to ensure replay typing happens exactly once per load.
  const routeLoadTokenRef = useRef(0);

  // Avoid re-applying identical rendered payloads (prevents redraw churn)
  const lastAppliedSigRef = useRef({ id: null, sig: null });

  // Drop stale responses deterministically
  const inFlightRef = useRef({ id: null, seq: 0 });

  useEffect(() => {
    const fetchFn = authFetchRef?.current;

    const isRootRoute =
      routeConversationId == null || routeConversationId === "";

    const parsedId = isRootRoute ? null : Number(routeConversationId);
    const id = Number.isFinite(parsedId) ? parsedId : null;

    if (!fetchFn) {
      setIsLoadingConversation(false);
      return;
    }

    // Param exists but not a valid numeric id yet: do nothing (don’t clear, don’t load)
    if (!isRootRoute && id == null) {
      setIsLoadingConversation(false);
      return;
    }

    // "/" route: clear only if we came from a conversation
    if (isRootRoute) {
      if (lastCommittedConversationIdRef.current != null) {
        setMessages([]);
        lastCommittedConversationIdRef.current = null;
        lastAppliedSigRef.current = { id: null, sig: null };
      }
      setConversationOwnerId?.(null);
      setIsLoadingConversation(false);

      return;
    }

    const prevCommittedId = lastCommittedConversationIdRef.current;
    const isRouteSwitch = prevCommittedId !== id;

    // If switching to another conversation route, clear immediately to prevent any “mixed” UI
    // while the new conversation loads.
    if (isRouteSwitch) {
      setMessages([]);
      setConversationTitle?.("");
      setConversationOwnerId?.(null);
      // new load token for this route switch
      routeLoadTokenRef.current += 1;
      // reset signature guard so new convo can commit even if structurally similar
      lastAppliedSigRef.current = { id: null, sig: null };
    }

    let cancelled = false;
    const controller = new AbortController();

    const seq = inFlightRef.current.seq + 1;
    inFlightRef.current = { id, seq };

    setIsLoadingConversation(true);

    (async () => {
      try {
        const url =
          mode === "admin"
            ? `/api/v1/admin/conversations/${id}`
            : `/api/v1/conversations/${id}`;

        const res = await fetchFn(url, { signal: controller.signal });

        if (!res?.ok) throw new Error("Failed to load conversation");

        const data = await res.json();

        if (cancelled) return;
        if (inFlightRef.current.seq !== seq || inFlightRef.current.id !== id)
          return;

        // Conversation owner (needed to decide readOnly on /admin/conversations/:id)
        const ownerId = mode === "admin" ? (data?.user_id ?? null) : null;
        setConversationOwnerId?.(ownerId != null ? Number(ownerId) : null);

        setConversationTitle?.(
          String(data?.title || data?.conversation?.title || ""),
        );

        // Restore raw conversation messages (keep raw assistant markdown)
        const restoredMsgsRaw = (data?.messages || []).map((m) => {
          const msgIdNum = m?.id;
          const role = m?.role;
          const isUser = role === "user";

          return {
            id: `conv_${msgIdNum}`,
            conv_message_id: msgIdNum,
            type: isUser ? "user" : "assistant",
            content: m?.content || "",
          };
        });

        // Inject artifacts using conversation_message_id anchoring
        const restoredWithArtifactsBase = injectArtifactsAfterMessage(
          restoredMsgsRaw,
          data?.artifacts || [],
        );

        // Apply replayTyping ONLY for the last assistant message,
        // and only for this route load token (so it types once per load).
        const replayKey = routeLoadTokenRef.current;

        let lastAssistantId = null;
        for (let i = restoredWithArtifactsBase.length - 1; i >= 0; i--) {
          if (restoredWithArtifactsBase[i]?.type === "assistant") {
            lastAssistantId = restoredWithArtifactsBase[i].id;
            break;
          }
        }

        const restoredWithArtifacts = lastAssistantId
          ? restoredWithArtifactsBase.map((m) =>
              m.id === lastAssistantId
                ? { ...m, replayTyping: true, replayKey }
                : m,
            )
          : restoredWithArtifactsBase;

        // Signature guard: if identical payload for this conversation id, do nothing.
        // Include replayKey so the “type once per load” is preserved (new load => new sig).
        const sig = JSON.stringify(
          restoredWithArtifacts.map((m) => ({
            id: m.id,
            type: m.type,
            content: m.content,
            replayTyping: !!m.replayTyping,
            replayKey: m.replayKey || 0,
            statusText: m.statusText || "",
            streaming: !!m.streaming,
            kind: m.kind || "",
          })),
        );

        if (
          lastAppliedSigRef.current.id === id &&
          lastAppliedSigRef.current.sig === sig
        ) {
          return;
        }

        lastAppliedSigRef.current = { id, sig };

        // Route switch: ALWAYS replace (never merge) to prevent cross-convo mixing.
        if (isRouteSwitch) {
          setMessages(restoredWithArtifacts);
          lastCommittedConversationIdRef.current = id;
          return;
        }

        // Same conversation route: merge silently (no repeated replay unless replayKey changed)
        setMessages((prev) => {
          const cleanedPrev = Array.isArray(prev)
            ? prev.filter((m) => !(m?.type === "assistant" && m?.streaming))
            : [];

          const merged = mergeById(cleanedPrev, restoredWithArtifacts);

          // No-op if shallow-equal for stable fields
          if (merged.length === cleanedPrev.length) {
            let same = true;
            for (let i = 0; i < merged.length; i++) {
              const a = merged[i];
              const b = cleanedPrev[i];
              if (
                a?.id !== b?.id ||
                a?.type !== b?.type ||
                a?.content !== b?.content ||
                !!a?.replayTyping !== !!b?.replayTyping ||
                (a?.replayKey || 0) !== (b?.replayKey || 0)
              ) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }

          return merged;
        });
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
    authFetchRef?.current,
    setMessages,
    setConversationTitle,
    setConversationOwnerId,
    showToast,
    t,
    mode,
  ]);

  return { isLoadingConversation };
}
