import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import vegaEmbed from "vega-embed";

/*
  VegaChart goals:
  - Render Vega/Vega-Lite specs reliably inside:
    - LandingPage message bubbles
    - Dashboard widgets
    - Dashboard modal (expanded)
  - Avoid CSS stretching/distortion. Prefer re-rendering to container.
  - Respond to:
    - container resize (ResizeObserver)
    - window resize
    - orientation/viewport changes (visualViewport)
  - Keep rendering stable (avoid flicker + render storms).
*/

function clamp(n, min, max) {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeNumber(n, fallback) {
  if (typeof n !== "number" || Number.isNaN(n)) return fallback;
  return n;
}

function normalizeSpec(
  spec,
  { preferContainerSizing = true, targetW, targetH, slotW, slotH } = {}
) {
  if (!spec || typeof spec !== "object") return spec;

  const copy = Array.isArray(spec) ? [...spec] : { ...spec };

  if (copy.$schema && String(copy.$schema).includes("vega-lite")) {
    if (preferContainerSizing) {
      const autosize =
        copy.autosize && typeof copy.autosize === "object" ? copy.autosize : {};

      // If the container is not measurable yet (common in modals),
      // do NOT use "container" sizing because it can resolve to 0.
      const slotIsMeasurable = (slotW || 0) >= 40 && (slotH || 0) >= 40;

      delete copy.width;
      delete copy.height;

      if (slotIsMeasurable) {
        copy.width = "container";
        copy.height = "container";
        copy.autosize = {
          type: "fit",
          contains: "padding",
          resize: true,
          ...autosize,
        };
      } else {
        // Force numeric sizing as a fallback so Vega-Lite can render immediately.
        copy.width = targetW;
        copy.height = targetH;
        copy.autosize = {
          type: "fit",
          contains: "padding",
          resize: true,
          ...autosize,
        };
      }
    }
  }

  return copy;
}

function getSlotEl(containerEl) {
  if (!containerEl) return null;

  // Priority order:
  // 1) explicit slot
  // 2) dashboard modal inner (expanded)
  // 3) widget capture (collapsed)
  // 4) parent element
  const explicit =
    containerEl.closest?.(".vega-chart-slot") ||
    containerEl.querySelector?.(".vega-chart-slot");
  if (explicit) return explicit;

  const modalInner = containerEl.closest?.(".dashboard-widget-modal-inner");
  if (modalInner) return modalInner;

  const widgetCapture = containerEl.closest?.(".dashboard-widget-capture");
  if (widgetCapture) return widgetCapture;

  return containerEl.parentElement || containerEl;
}

function getSlotSize(containerEl) {
  const slotEl = getSlotEl(containerEl);
  if (!slotEl) return { w: 0, h: 0 };

  // clientWidth/clientHeight are more stable for flex containers than offset*
  const w = slotEl.clientWidth || 0;
  const h = slotEl.clientHeight || 0;
  return { w, h };
}

export default function VegaChart({
  spec,
  className = "",
  style = {},
  onError,
  onRendered,
  embedOptions = {},
}) {
  const containerRef = useRef(null);
  const embedRef = useRef(null); // holds { view, ... }
  const resizeRafRef = useRef(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const lastSpecKeyRef = useRef("");
  const [renderError, setRenderError] = useState(null);

  const specKey = useMemo(() => {
    // A cheap "key" to detect changes without deep hashing every render.
    // If you already provide deterministic IDs in spec/metadata, adapt this.
    try {
      return JSON.stringify({
        t: spec?.title || "",
        d: spec?.description || "",
        m: spec?.mark || "",
        e: spec?.encoding ? Object.keys(spec.encoding) : [],
        s: spec?.$schema || "",
      });
    } catch {
      return String(Date.now());
    }
  }, [spec]);

  const inModal = useMemo(() => {
    const el = containerRef.current;
    return Boolean(el?.closest?.(".dashboard-widget-modal"));
  }, [specKey]);

  const computeTargetDims = (slotW, slotH) => {
    // Fallbacks: ensure we always provide non-zero targets so Vega can render.
    // Use safer modal defaults and better widget defaults.
    const isNarrow = slotW > 0 && slotW < 520;

    const fallbackW = isNarrow ? 340 : 520;
    const fallbackH = inModal ? 420 : isNarrow ? 220 : 320;

    const w = safeNumber(slotW, fallbackW);
    const h = safeNumber(slotH, fallbackH);

    // Hard clamps to avoid massive render sizes.
    // Modal can be taller; widgets should not exceed their card body.
    const maxW = inModal ? 1400 : 1100;
    const maxH = inModal ? 900 : 520;

    const safeW = clamp(w, 240, maxW);
    const safeH = clamp(h, 320, maxH);

    return { safeW, safeH };
  };

  const destroyEmbed = async () => {
    try {
      if (embedRef.current?.view) {
        embedRef.current.view.finalize();
      }
    } catch {
      // ignore
    }
    embedRef.current = null;
  };

  const runEmbed = async ({ force = false } = {}) => {
    const el = containerRef.current;
    if (!el) return;

    if (!spec || typeof spec !== "object") {
      setRenderError(new Error("Invalid Vega spec"));
      return;
    }

    const { w: slotW, h: slotH } = getSlotSize(el);
    const { safeW, safeH } = computeTargetDims(slotW, slotH);

    const sameSpecKey = lastSpecKeyRef.current === specKey;

    // Use a slightly larger threshold to avoid resize oscillation loops in chat bubbles
    const sizeEps = inModal ? 2 : 8;

    const sameSize =
      Math.abs(lastSizeRef.current.w - safeW) < sizeEps &&
      Math.abs(lastSizeRef.current.h - safeH) < sizeEps;

    // If nothing meaningful changed, bail
    if (!force && sameSize && sameSpecKey && embedRef.current?.view) return;

    // Update "last"
    lastSizeRef.current = { w: safeW, h: safeH };
    lastSpecKeyRef.current = specKey;

    setRenderError(null);

    // If we already have a view and spec didn't change, resize the view instead of re-embedding.
    if (embedRef.current?.view && sameSpecKey) {
      try {
        const v = embedRef.current.view;

        // These exist on Vega View; safe to guard.
        v.width?.(safeW);
        v.height?.(safeH);

        v.resize?.();
        await v.runAsync?.();

        onRendered?.(embedRef.current);
        return;
      } catch {
        // If resize fails for any reason, fall back to a full re-embed below.
      }
    }

    // Full embed only when needed (first render or spec change)
    const normalizedSpec = normalizeSpec(spec, {
      preferContainerSizing: true,
      targetW: safeW,
      targetH: safeH,
      slotW,
      slotH,
    });

    // Clear container before embedding (avoid stacking)
    if (embedRef.current?.view) {
      try {
        embedRef.current.view.finalize();
      } catch {}
      embedRef.current = null;
    }
    el.innerHTML = "";

    try {
      const opts = {
        actions: false,
        renderer: "canvas",
        ...embedOptions,
      };

      const result = await vegaEmbed(el, normalizedSpec, opts);
      embedRef.current = result;

      try {
        result.view.resize?.();
        await result.view.runAsync?.();
      } catch {}

      onRendered?.(result);
    } catch (err) {
      setRenderError(err);
      onError?.(err);
    }
  };

  const scheduleResize = ({ force = false } = {}) => {
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
    }
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null;
      runEmbed({ force }).catch(() => {});
    });
  };

  // Initial render + when spec changes
  useLayoutEffect(() => {
    scheduleResize({ force: true });
    return () => {
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  // ResizeObserver to follow container size changes (widgets, modal, rotation)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const slotEl = getSlotEl(el);
    if (!slotEl) return;

    const ro = new ResizeObserver(() => {
      scheduleResize({ force: false });
    });

    ro.observe(slotEl);

    // Also observe the container itself (sometimes slotEl doesn't change,
    // but the container gets reflowed)
    if (slotEl !== el) ro.observe(el);

    return () => {
      try {
        ro.disconnect();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  // Window resize / visualViewport resize (mobile rotate + address bar)
  useEffect(() => {
    const onWinResize = () => scheduleResize({ force: false });

    window.addEventListener("resize", onWinResize, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onWinResize, { passive: true });
      vv.addEventListener("scroll", onWinResize, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", onWinResize);
      if (vv) {
        vv.removeEventListener("resize", onWinResize);
        vv.removeEventListener("scroll", onWinResize);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroyEmbed().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`vega-chart-container ${className}`.trim()} style={style}>
      {renderError ? (
        <div className="vega-chart-error">
          Unable to render chart visualization. Please refer to the textual
          explanation.
        </div>
      ) : null}
      <div ref={containerRef} className="vega-chart-embed" />
    </div>
  );
}
