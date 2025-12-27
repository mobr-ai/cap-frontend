// src/utils/shareWidgetImage.js
import { toPng } from "html-to-image";

/**
 * Watermark presets
 * - default is logoBottomRight
 * - share uses logoCenterBig by default in your DashboardWidget.jsx
 */
export const WATERMARK_PRESETS = {
  none: { kind: "none" },

  textBottomRight: {
    kind: "text",
    text: "CAP",
    position: "bottom-right",
    opacity: 0.16,
    fontSize: 28,
    padding: 18,
  },

  logoBottomRight: {
    kind: "logo",
    src: "/icons/logo.svg",
    position: "bottom-right",
    opacity: 0.12,
    size: 160,
    padding: 18,
  },

  logoCenterBig: {
    kind: "logo",
    src: "/icons/logo.svg",
    position: "center",
    opacity: 0.08,
    size: 520,
    padding: 0,
  },
};

/* ----------------------------- helpers ----------------------------- */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function safeText(s) {
  return String(s || "").trim();
}

// Cache the logo as data URL so html-to-image embeds it reliably.
let _logoDataUrl = null;
async function getLogoDataUrl(src) {
  if (!src) return null;
  if (_logoDataUrl && src === "/icons/logo.svg") return _logoDataUrl;

  // If already a data URL, just return it.
  if (src.startsWith("data:")) return src;

  try {
    const res = await fetch(src, { cache: "force-cache" });
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(blob);
    });
    if (src === "/icons/logo.svg") _logoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Some components (tables) rely on "height: 100%" + overflow containers.
 * In an offscreen clone, that often collapses to 0px or crops to the visible part.
 * This forces "natural height" for export.
 */
function forceExpandForExport(root) {
  if (!root) return;

  // Make sure all ancestors in the clone allow full painting
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    const cs = window.getComputedStyle(el);

    // Expand scroll containers
    if (
      cs.overflow === "auto" ||
      cs.overflow === "scroll" ||
      cs.overflow === "hidden"
    ) {
      el.style.overflow = "visible";
    }

    // Remove constraints that cause cropping/collapse in the clone
    if (cs.maxHeight && cs.maxHeight !== "none") el.style.maxHeight = "none";
    if (cs.height && cs.height.endsWith("%")) el.style.height = "auto";

    // Ensure tables remain readable even if your app theme uses light text
    if (el.classList?.contains("kv-table") || el.closest?.(".kv-table")) {
      // Keep structure but force readable export colors
      el.style.color = "#0f172a";
      el.style.background = "#ffffff";
    }
  });

  // Specific known wrappers
  const kvWrap = root.querySelector(".kv-table-wrapper");
  if (kvWrap) {
    kvWrap.style.overflow = "visible";
    kvWrap.style.height = "auto";
    kvWrap.style.maxHeight = "none";
    kvWrap.style.alignContent = "stretch";
  }

  // If we have a table, let it size naturally
  const kvTable = root.querySelector(".kv-table");
  if (kvTable) {
    kvTable.style.width = "max-content";
    kvTable.style.background = "#ffffff";
    kvTable.style.color = "#0f172a";
  }
}

/**
 * Builds a share card that looks like your live widgets:
 * - rounded outer container
 * - title bar (bigger and readable)
 * - content area (white) with watermark overlay
 */
async function buildShareCardNode({
  contentNode,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
}) {
  const outer = document.createElement("div");
  outer.setAttribute("data-cap-sharecard", "1");

  outer.style.display = "inline-block";
  outer.style.borderRadius = "26px";
  outer.style.overflow = "hidden";
  outer.style.background = "#ffffff";
  outer.style.border = "1px solid rgba(2, 6, 23, 0.18)";
  outer.style.boxShadow = "0 14px 45px rgba(0,0,0,0.20)";

  // Title bar
  if (titleBar) {
    const head = document.createElement("div");
    head.style.background = "#3f4756";
    head.style.color = "#ffffff";
    head.style.padding = "18px 20px";
    head.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    head.style.display = "flex";
    head.style.flexDirection = "column";
    head.style.gap = "6px";

    const t = document.createElement("div");
    t.textContent = safeText(title);
    t.style.fontSize = "22px";
    t.style.fontWeight = "700";
    t.style.lineHeight = "1.15";
    t.style.letterSpacing = "0.2px";

    const sub = document.createElement("div");
    sub.textContent = safeText(subtitle);
    sub.style.fontSize = "14px";
    sub.style.opacity = "0.92";
    sub.style.lineHeight = "1.2";

    head.appendChild(t);
    if (safeText(subtitle)) head.appendChild(sub);
    outer.appendChild(head);
  }

  // Body
  const body = document.createElement("div");
  body.style.position = "relative";
  body.style.background = "#ffffff";
  body.style.padding = "18px";
  body.style.display = "inline-block";

  // Content wrapper (ensures no stretching)
  const contentWrap = document.createElement("div");
  contentWrap.style.display = "inline-block";
  contentWrap.style.background = "#ffffff";
  contentWrap.style.color = "#0f172a";

  // Insert cloned node
  contentWrap.appendChild(contentNode);
  body.appendChild(contentWrap);

  // Watermark overlay
  const wm = watermark || WATERMARK_PRESETS.none;
  if (wm.kind !== "none") {
    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.opacity = String(clamp(wm.opacity ?? 0.12, 0.02, 0.4));

    if (wm.kind === "text") {
      const txt = document.createElement("div");
      txt.textContent = safeText(wm.text || "CAP");
      txt.style.fontFamily =
        "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      txt.style.fontWeight = "800";
      txt.style.color = "#0b1222";
      txt.style.fontSize = `${wm.fontSize || 48}px`;
      txt.style.userSelect = "none";
      overlay.appendChild(txt);
    }

    if (wm.kind === "logo") {
      const img = document.createElement("img");
      const dataUrl = await getLogoDataUrl(wm.src || "/icons/logo.svg");
      img.src = dataUrl || wm.src || "/icons/logo.svg";
      img.alt = "CAP";
      img.draggable = false;
      img.style.width = `${wm.size || 320}px`;
      img.style.height = "auto";
      img.style.userSelect = "none";
      overlay.appendChild(img);
    }

    // Positioning
    if (wm.position === "bottom-right") {
      overlay.style.alignItems = "flex-end";
      overlay.style.justifyContent = "flex-end";
      overlay.style.padding = `${wm.padding ?? 16}px`;
    } else if (wm.position === "center") {
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
    }

    body.appendChild(overlay);
  }

  outer.appendChild(body);
  return outer;
}

/**
 * Creates a hidden sandbox, renders node there, exports with html-to-image,
 * then cleans up.
 */
async function exportNodeToPngDataUrl(
  node,
  { pixelRatio = 2, backgroundColor = "#ffffff" } = {}
) {
  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.zIndex = "-1";
  sandbox.style.padding = "0";
  sandbox.style.margin = "0";
  sandbox.style.background = "transparent";

  document.body.appendChild(sandbox);
  sandbox.appendChild(node);

  // Force a layout pass
  await new Promise((r) => requestAnimationFrame(r));

  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  try {
    return await toPng(node, {
      cacheBust: true,
      pixelRatio,
      backgroundColor,
      width,
      height,
      // ensure correct sizing in foreignObject
      style: {
        transform: "scale(1)",
        transformOrigin: "top left",
      },
    });
  } finally {
    sandbox.remove();
  }
}

/* ----------------------------- public API ----------------------------- */

/**
 * Export a DOM element (tables use this)
 */
export async function exportElementAsPngDataUrl({
  element,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  pixelRatio = 2,
} = {}) {
  if (!element) return null;

  // Clone the element so we can safely override styles for export.
  const clone = element.cloneNode(true);

  // IMPORTANT: make sure clone paints fully (no scroll-crop / no 0-height collapse)
  forceExpandForExport(clone);

  // Make links readable in export
  clone.querySelectorAll("a").forEach((a) => {
    a.style.color = "#2563eb";
    a.style.textDecoration = "underline";
  });

  // Ensure table header/background remains visible
  clone.querySelectorAll(".kv-table thead th").forEach((th) => {
    th.style.background = "#0b1222";
    th.style.color = "#ffffff";
  });

  const card = await buildShareCardNode({
    contentNode: clone,
    title,
    subtitle,
    titleBar,
    watermark,
  });

  return exportNodeToPngDataUrl(card, {
    pixelRatio,
    backgroundColor: "#ffffff",
  });
}

/**
 * Export a Vega chart view (charts use this)
 * Note: This does NOT fix your expanded tooltip issue (separate topic).
 * It just exports a consistent image.
 */
export async function exportChartAsPngDataUrl({
  vegaView,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  targetWidth = 1600,
} = {}) {
  if (!vegaView) return null;

  // Vega can render to a PNG at a target width; scale keeps it sharp.
  // (If width isn't available, fallback to DOM export in caller.)
  let dataUrl = null;

  try {
    let w = Number(vegaView.width?.() || 0);

    // Force a sane width if Vega reports 0 (VERY common offscreen)
    if (!w || w < 10) {
      w = 800;
      try {
        vegaView.width(w);
        vegaView.resize();
        await vegaView.runAsync();
      } catch {}
    }

    const scale = targetWidth / w;
    const clampScale = clamp(scale, 1, 4);

    dataUrl = await vegaView.toImageURL("png", clampScale);
  } catch {
    dataUrl = null;
  }

  if (!dataUrl) return null;

  // Wrap it in the same share card frame for consistent look
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = safeText(title) || "chart";
  img.draggable = false;
  img.style.display = "block";
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.style.background = "#ffffff";

  const wrap = document.createElement("div");
  wrap.style.display = "inline-block";
  wrap.style.background = "#ffffff";
  wrap.appendChild(img);

  const card = await buildShareCardNode({
    contentNode: wrap,
    title,
    subtitle,
    titleBar,
    watermark,
  });

  // High-ish pixel ratio but not insane
  return exportNodeToPngDataUrl(card, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
}
