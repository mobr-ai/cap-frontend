// src/utils/landingPinOps.js

function findSourceQuery(messages, messageId) {
  const idx = (messages || []).findIndex((m) => m?.id === messageId);
  if (idx <= 0) return "";

  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]?.type === "user") return messages[i]?.content || "";
  }
  return "";
}

function buildPinTitle({ message, sourceQuery }) {
  const artifactType = message?.type === "table" ? "table" : "chart";
  const titleBase = artifactType === "table" ? "Table" : "Chart";

  if (message?.title) return message.title;

  if (sourceQuery) return `${titleBase}: ${String(sourceQuery).slice(0, 80)}`;

  return `${titleBase} ${new Date().toLocaleTimeString()}`;
}

function buildPinConfig(message) {
  if (message?.type === "table") {
    return { kv: message.kv };
  }
  return { vegaSpec: message.vegaSpec, kvType: message.kvType };
}

/**
 * Pins a chart/table artifact to the dashboard.
 * Throws on failure.
 */
export async function pinLandingArtifact({
  fetchFn,
  message,
  messages,
  conversationId,
}) {
  if (!fetchFn) throw new Error("missing_fetch");
  if (!message) throw new Error("missing_message");

  const sourceQuery = findSourceQuery(messages || [], message.id);
  const artifact_type = message.type === "table" ? "table" : "chart";
  const title = buildPinTitle({ message, sourceQuery });
  const config = buildPinConfig(message);

  const res = await fetchFn("/api/v1/dashboard/pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artifact_type,
      title,
      source_query: sourceQuery,
      config,
      conversation_id: conversationId || null,
    }),
  });

  if (!res?.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to pin artifact");
  }

  return { artifact_type, title, sourceQuery };
}
