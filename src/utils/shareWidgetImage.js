// src/utils/shareWidgetImage.js
import { toPng } from "html-to-image";

/**
 * Watermark presets
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

function isNumericHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x === "count" ||
    x.endsWith("count") ||
    x.includes("votes") ||
    x.includes("vote") ||
    x.includes("yes") ||
    x.includes("no") ||
    x.includes("abstain") ||
    x.includes("total") ||
    x.includes("amount") ||
    x.includes("sum") ||
    x.includes("avg") ||
    x.includes("min") ||
    x.includes("max")
  );
}

function isTimeHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x.includes("timestamp") ||
    x.includes("time") ||
    x.includes("date") ||
    x.includes("slot") ||
    x.includes("epoch")
  );
}

function isHashishHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x.includes("hash") ||
    x.includes("tx") ||
    x.endsWith("id") ||
    x.includes("address") ||
    x.includes("policy") ||
    x.includes("fingerprint")
  );
}

function isUrlHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return x.includes("url") || x.includes("link") || x.includes("ipfs");
}

// Cache the logo as data URL so html-to-image embeds it reliably.
let _logoDataUrl = null;
async function getLogoDataUrl(src) {
  if (!src) return null;
  if (_logoDataUrl && src === "/icons/logo.svg") return _logoDataUrl;
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

function approxCellText(cell) {
  if (!cell) return "";
  const a = cell.querySelector && cell.querySelector("a");
  if (a && a.textContent) return String(a.textContent).trim();
  return String(cell.textContent || "").trim();
}

/**
 * Content-aware smart <colgroup> for mixed tables.
 * - numeric cols narrow
 * - timestamps medium
 * - hashes/ids large
 * - urls largest
 * - also considers actual body text lengths (sampled) so it adapts per table
 *
 * Works best with table-layout: fixed.
 */
function applySmartColGroup(tableEl, sandboxWidthPx) {
  if (!tableEl) return;

  const headerRow = tableEl.querySelector("thead tr");
  if (!headerRow) return;

  const ths = Array.from(headerRow.querySelectorAll("th"));
  const headers = ths.map((th) => String(th.textContent || "").trim());
  const headersLower = headers.map((h) => h.toLowerCase());
  const n = headers.length;
  if (!n) return;

  tableEl.querySelectorAll("colgroup").forEach((cg) => cg.remove());

  const rows = Array.from(tableEl.querySelectorAll("tbody tr")).slice(0, 25);
  const maxLens = new Array(n).fill(0);

  rows.forEach((tr) => {
    const tds = Array.from(tr.querySelectorAll("td"));
    for (let i = 0; i < n; i += 1) {
      const txt = approxCellText(tds[i]);
      const len = Math.min(90, txt.length);
      if (len > maxLens[i]) maxLens[i] = len;
    }
  });

  const baseWeights = headersLower.map((h) => {
    if (isNumericHeaderName(h)) return 0.55;
    if (isTimeHeaderName(h)) return 1.25;
    if (isUrlHeaderName(h)) return 2.6;
    if (isHashishHeaderName(h)) return 2.2;
    return 1.0;
  });

  // Minimum px widths so headers like "proposalTimestamp" never get crushed.
  const minPx = headersLower.map((h) => {
    if (isNumericHeaderName(h)) return 90;
    if (isTimeHeaderName(h)) return 210;
    if (isUrlHeaderName(h)) return 320;
    if (isHashishHeaderName(h)) return 320;
    return 160;
  });

  const extra = headers.map((h, i) => {
    const headerLen = Math.min(30, String(h || "").length);
    const contentLen = maxLens[i];

    if (isNumericHeaderName(headersLower[i])) {
      return 0.08 * headerLen + 0.02 * Math.min(20, contentLen);
    }
    if (isTimeHeaderName(headersLower[i])) {
      return 0.06 * headerLen + 0.03 * Math.min(40, contentLen);
    }
    if (
      isUrlHeaderName(headersLower[i]) ||
      isHashishHeaderName(headersLower[i])
    ) {
      return 0.05 * headerLen + 0.035 * Math.min(70, contentLen);
    }
    return 0.06 * headerLen + 0.03 * Math.min(50, contentLen);
  });

  const weights = baseWeights.map((b, i) => b + extra[i]);

  const wDen = weights.reduce((a, b) => a + b, 0) || 1;
  let pct = weights.map((w) => (w / wDen) * 100);

  const denomW = Math.max(600, Number(sandboxWidthPx) || 1200);
  let minPct = minPx.map((px) => (px / denomW) * 100);

  let totalMin = minPct.reduce((a, b) => a + b, 0);
  if (totalMin > 100) {
    const scale = 100 / totalMin;
    minPct = minPct.map((p) => p * scale);
    totalMin = 100;
  }

  // Enforce minimums
  let used = 0;
  const fixed = new Array(n).fill(false);
  for (let i = 0; i < n; i += 1) {
    if (pct[i] < minPct[i]) {
      pct[i] = minPct[i];
      fixed[i] = true;
    }
    used += pct[i];
  }

  // If over budget, reduce flex columns proportionally
  if (used > 100) {
    const over = used - 100;
    let flexSum = 0;
    for (let i = 0; i < n; i += 1) if (!fixed[i]) flexSum += pct[i];

    if (flexSum > 0) {
      for (let i = 0; i < n; i += 1) {
        if (!fixed[i]) {
          const cut = (pct[i] / flexSum) * over;
          pct[i] = Math.max(minPct[i], pct[i] - cut);
        }
      }
    }
  } else if (used < 100) {
    // If under budget, give it to non-numeric columns
    const remain = 100 - used;
    let flexW = 0;
    for (let i = 0; i < n; i += 1) {
      if (!isNumericHeaderName(headersLower[i])) flexW += weights[i];
    }

    if (flexW > 0) {
      for (let i = 0; i < n; i += 1) {
        if (!isNumericHeaderName(headersLower[i])) {
          pct[i] += (weights[i] / flexW) * remain;
        }
      }
    }
  }

  // Clamp extremes a bit, then renormalize
  pct = pct.map((p, i) => {
    if (isNumericHeaderName(headersLower[i])) return clamp(p, minPct[i], 14);
    return clamp(p, minPct[i], 52);
  });

  const sumPct = pct.reduce((a, b) => a + b, 0) || 1;
  pct = pct.map((p) => (p / sumPct) * 100);

  const colgroup = document.createElement("colgroup");
  for (let i = 0; i < n; i += 1) {
    const col = document.createElement("col");
    col.style.width = `${pct[i].toFixed(3)}%`;
    colgroup.appendChild(col);
  }
  tableEl.insertBefore(colgroup, tableEl.firstChild);

  // Wrap long strings sanely
  tableEl.querySelectorAll("th, td").forEach((cell) => {
    cell.style.whiteSpace = "normal";
    cell.style.wordBreak = "break-word";
    cell.style.overflowWrap = "anywhere";
    cell.style.verticalAlign = "top";
  });

  // Numeric columns: compact + right aligned (header + body)
  headersLower.forEach((h, idx) => {
    if (!isNumericHeaderName(h)) return;
    const nth = idx + 1;
    tableEl
      .querySelectorAll(
        `thead th:nth-child(${nth}), tbody td:nth-child(${nth})`,
      )
      .forEach((cell) => {
        cell.style.whiteSpace = "nowrap";
        cell.style.textAlign = "right";
      });
  });
}

/**
 * Expand scroll containers and normalize KVTable so it exports cleanly.
 * IMPORTANT: this is export-only (runs on a clone).
 */
function forceExpandForExport(root, sandboxWidthPx) {
  if (!root) return;

  // Expand all descendants that may clip/collapse in the clone
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    const cs = window.getComputedStyle(el);

    if (
      cs.overflow === "auto" ||
      cs.overflow === "scroll" ||
      cs.overflow === "hidden"
    ) {
      el.style.overflow = "visible";
    }

    if (cs.maxHeight && cs.maxHeight !== "none") el.style.maxHeight = "none";
    if (cs.height && cs.height.endsWith("%")) el.style.height = "auto";

    if (el.classList?.contains("kv-table") || el.closest?.(".kv-table")) {
      el.style.color = "#0f172a";
      el.style.background = "#ffffff";
    }
  });

  // Also expand the root itself if it is a scroll container
  {
    const cs = window.getComputedStyle(root);
    if (
      cs.overflow === "auto" ||
      cs.overflow === "scroll" ||
      cs.overflow === "hidden"
    ) {
      root.style.overflow = "visible";
    }
    if (cs.maxHeight && cs.maxHeight !== "none") root.style.maxHeight = "none";
  }

  const isRootWrap = root.classList?.contains("kv-table-wrapper");
  const isRootTable = root.classList?.contains("kv-table");

  const kvWrap = isRootWrap ? root : root.querySelector(".kv-table-wrapper");
  if (kvWrap) {
    kvWrap.style.overflow = "visible";
    kvWrap.style.height = "auto";
    kvWrap.style.maxHeight = "none";
    kvWrap.style.display = "block";
    kvWrap.style.width = "100%";
    kvWrap.style.maxWidth = "100%";
    kvWrap.style.boxSizing = "border-box";
    kvWrap.style.background = "#ffffff";
  }

  // Critical fix: if root IS the table, use it directly.
  const kvTable = isRootTable ? root : root.querySelector(".kv-table");
  if (kvTable) {
    kvTable.style.width = "100%";
    kvTable.style.maxWidth = "100%";
    kvTable.style.tableLayout = "fixed";
    kvTable.style.borderCollapse = "collapse";
    kvTable.style.boxSizing = "border-box";
    kvTable.style.background = "#ffffff";
    kvTable.style.color = "#0f172a";

    applySmartColGroup(kvTable, sandboxWidthPx);
  }
}

/**
 * Builds the share card frame.
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

  // Critical: do NOT shrink-wrap the card; let it fill sandbox width
  outer.style.display = "block";
  outer.style.width = "100%";
  outer.style.boxSizing = "border-box";

  outer.style.borderRadius = "26px";
  outer.style.overflow = "hidden";
  outer.style.background = "#ffffff";
  outer.style.border = "1px solid rgba(2, 6, 23, 0.18)";
  outer.style.boxShadow = "0 14px 45px rgba(0,0,0,0.20)";

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

  const body = document.createElement("div");
  body.style.position = "relative";
  body.style.background = "#ffffff";
  body.style.padding = "18px";
  body.style.display = "block";
  body.style.width = "100%";
  body.style.boxSizing = "border-box";

  const contentWrap = document.createElement("div");
  contentWrap.style.display = "block";
  contentWrap.style.width = "100%";
  contentWrap.style.maxWidth = "100%";
  contentWrap.style.boxSizing = "border-box";
  contentWrap.style.background = "#ffffff";
  contentWrap.style.color = "#0f172a";

  contentWrap.appendChild(contentNode);
  body.appendChild(contentWrap);

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
  { pixelRatio = 2, backgroundColor = "#ffffff", sandboxWidth = 1200 } = {},
) {
  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.zIndex = "-1";
  sandbox.style.padding = "0";
  sandbox.style.margin = "0";
  sandbox.style.background = "transparent";

  sandbox.style.width = `${sandboxWidth}px`;
  sandbox.style.maxWidth = `${sandboxWidth}px`;
  sandbox.style.boxSizing = "border-box";
  sandbox.style.display = "block";

  document.body.appendChild(sandbox);
  sandbox.appendChild(node);

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

export async function exportElementAsPngDataUrl({
  element,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  pixelRatio = 2,
} = {}) {
  if (!element) return null;

  const sandboxWidthPx = 1200;

  const clone = element.cloneNode(true);

  // Make sure clone paints fully and tables are normalized even when
  // element === .kv-table (dashboard often passes the table node directly).
  forceExpandForExport(clone, sandboxWidthPx);

  // Make links readable in export
  clone.querySelectorAll("a").forEach((a) => {
    a.style.color = "#2563eb";
    a.style.textDecoration = "underline";
  });

  // Ensure table header/background remains visible
  // (also handle case where clone itself is the table)
  if (clone.classList?.contains("kv-table")) {
    clone.querySelectorAll("thead th").forEach((th) => {
      th.style.background = "#0b1222";
      th.style.color = "#ffffff";
    });
  } else {
    clone.querySelectorAll(".kv-table thead th").forEach((th) => {
      th.style.background = "#0b1222";
      th.style.color = "#ffffff";
    });
  }

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
    sandboxWidth: sandboxWidthPx,
  });
}

export async function exportChartAsPngDataUrl({
  vegaView,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  targetWidth = 1600,
} = {}) {
  if (!vegaView) return null;

  let dataUrl = null;

  try {
    let w = Number(vegaView.width?.() || 0);

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

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = safeText(title) || "chart";
  img.draggable = false;
  img.style.display = "block";
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.style.background = "#ffffff";

  const wrap = document.createElement("div");
  wrap.style.display = "block";
  wrap.style.width = "100%";
  wrap.style.maxWidth = "100%";
  wrap.style.boxSizing = "border-box";
  wrap.style.background = "#ffffff";
  wrap.appendChild(img);

  const card = await buildShareCardNode({
    contentNode: wrap,
    title,
    subtitle,
    titleBar,
    watermark,
  });

  return exportNodeToPngDataUrl(card, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    sandboxWidth: 1200,
  });
}
