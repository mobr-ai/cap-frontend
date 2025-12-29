// src/utils/landingShareOps.js
import {
  exportChartAsPngDataUrl,
  exportElementAsPngDataUrl,
  WATERMARK_PRESETS,
} from "@/utils/shareWidgetImage";

function buildTitle({ message, sourceQuery }) {
  const titleBase = message?.type === "table" ? "Table" : "Chart";
  if (message?.title) return message.title;

  if (sourceQuery) return `${titleBase}: ${String(sourceQuery).slice(0, 80)}`;

  return `${titleBase} ${new Date().toLocaleTimeString()}`;
}

function findSourceQuery(messages, messageId) {
  const idx = (messages || []).findIndex((m) => m?.id === messageId);
  if (idx <= 0) return "";

  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]?.type === "user") return messages[i]?.content || "";
  }
  return "";
}

async function renderVegaOffscreenToView(vegaOrVegaLiteSpec) {
  const mod = await import("vega-embed");
  const vegaEmbed = mod?.default || mod;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = "1200px";
  host.style.height = "700px";
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.appendChild(host);

  const res = await vegaEmbed(host, vegaOrVegaLiteSpec, {
    actions: false,
    renderer: "canvas",
  });

  const view = res?.view;
  if (!view) {
    try {
      host.remove();
    } catch {}
    throw new Error("offscreen_view_missing");
  }

  await view.runAsync();
  return { view, host };
}

/**
 * Build share payload for ShareModal from an artifact message.
 * Returns:
 *  - { title, imageDataUrl, hashtags, message }
 *  - or { error: "share_failed", ... } on failure
 */
export async function createSharePayloadForArtifact({
  message,
  messages,
  conversationTitle,
  tableElByMsgIdRef,
}) {
  try {
    if (!message) throw new Error("missing_message");

    const sourceQuery = findSourceQuery(messages || [], message.id);
    const title = buildTitle({ message, sourceQuery });
    const subtitle = conversationTitle ? String(conversationTitle) : "";

    let imageDataUrl = null;

    if (message.type === "chart" && message.vegaSpec) {
      const { view, host } = await renderVegaOffscreenToView(message.vegaSpec);

      try {
        imageDataUrl = await exportChartAsPngDataUrl({
          vegaView: view,
          title,
          subtitle,
          titleBar: true,
          watermark: WATERMARK_PRESETS.logoCenterBig,
          targetWidth: 1600,
        });
      } finally {
        try {
          view.finalize?.();
        } catch {}
        try {
          host.remove();
        } catch {}
      }
    } else if (message.type === "table" && message.kv) {
      const el = tableElByMsgIdRef?.current?.get(message.id) || null;
      if (!el) throw new Error("table_ref_missing");

      imageDataUrl = await exportElementAsPngDataUrl({
        element: el,
        title,
        subtitle,
        titleBar: true,
        watermark: WATERMARK_PRESETS.logoCenterBig,
        pixelRatio: 2,
      });
    } else {
      throw new Error("unsupported_message_type");
    }

    return {
      title,
      imageDataUrl,
      hashtags: ["CAP", "Cardano", "Analytics"],
      message: sourceQuery || "",
    };
  } catch {
    return {
      title: "CAP",
      imageDataUrl: null,
      hashtags: ["CAP", "Cardano", "Analytics"],
      message: "",
      error: "share_failed",
    };
  }
}
