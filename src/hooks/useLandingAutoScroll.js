// src/hooks/useLandingAutoScroll.js
import { useEffect, useRef } from "react";

export function useLandingAutoScroll({
  messages,
  isLoadingConversation,
  routeConversationId,
  messagesEndRef,
}) {
  const lastMsgCountRef = useRef(0);

  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef?.current?.scrollIntoView({
      behavior,
      block: "end",
    });
  };

  // Jump to bottom when a conversation finishes loading (instant on switch)
  useEffect(() => {
    if (!isLoadingConversation && (messages?.length || 0) > 0) {
      messagesEndRef?.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId, isLoadingConversation]);

  // Smooth scroll only when a message was appended (not updated)
  useEffect(() => {
    const len = messages?.length || 0;

    if (len > lastMsgCountRef.current) {
      scrollToBottom("smooth");
    }

    lastMsgCountRef.current = len;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  return { scrollToBottom };
}
