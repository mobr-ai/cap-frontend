// src/components/artifacts/VegaChart.jsx
import React from "react";

function deepClone(obj) {
  if (!obj) return obj;
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function normalizeSpec(spec, { inModal, isNarrow }) {
  const copy = deepClone(spec);

  if (typeof copy?.$schema === "string") {
    copy.$schema = copy.$schema
      .replace("vega-lite/v4.json", "vega-lite/v6.json")
      .replace("vega-lite/v5.json", "vega-lite/v6.json");
  }

  delete copy.width;
  delete copy.height;

  copy.autosize = {
    type: "fit",
    contains: "padding",
    resize: true,
    ...(copy.autosize || {}),
  };

  const basePad = isNarrow
    ? { top: 18, bottom: 28, left: 38, right: 10 }
    : { top: 24, bottom: 36, left: 48, right: 16 };

  const modalPad = isNarrow
    ? { top: 20, bottom: 32, left: 42, right: 12 }
    : { top: 28, bottom: 44, left: 56, right: 22 };

  copy.padding = {
    ...(inModal ? modalPad : basePad),
    ...(copy.padding || {}),
  };

  copy.config = {
    ...(copy.config || {}),
    mark: {
      ...(copy.config?.mark || {}),
      tooltip: true,
    },
    point: {
      ...(copy.config?.point || {}),
      size: 60,
      filled: true,
    },
  };

  return copy;
}

function getNumericHeightFromSpec(spec) {
  if (!spec) return 0;
  if (typeof spec.height === "number" && isFinite(spec.height))
    return spec.height;

  const h = spec?.view?.height ?? spec?.config?.view?.continuousHeight;
  if (typeof h === "number" && isFinite(h)) return h;

  return 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function findScrollParent(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    const cs = window.getComputedStyle(cur);
    const oy = cs.overflowY;
    if (oy === "auto" || oy === "scroll") return cur;
    cur = cur.parentElement;
  }
  return window;
}

function hasTransformTransition(cs) {
  const prop = (cs.transitionProperty || "").toLowerCase();
  const dur = (cs.transitionDuration || "").toLowerCase();
  const hasDuration = dur
    .split(",")
    .some((d) => d.trim() !== "0s" && d.trim() !== "0ms");
  if (!hasDuration) return false;

  if (prop.includes("transform") || prop.includes("all")) return true;
  return false;
}

function findTransitionHost(startEl) {
  // Walk up and pick the first ancestor that transitions transform.
  let cur = startEl;
  let steps = 0;
  while (cur && cur !== document.body && steps < 12) {
    const cs = window.getComputedStyle(cur);
    if (hasTransformTransition(cs)) return cur;
    cur = cur.parentElement;
    steps += 1;
  }
  return null;
}

export default function VegaChart({ spec, onViewReady }) {
  const containerRef = React.useRef(null);
  const viewRef = React.useRef(null);
  const cleanupRef = React.useRef({ removeMouseMove: null });

  const roRef = React.useRef(null);
  const resizeTimerRef = React.useRef(0);
  const rafResizeRef = React.useRef(0);
  const isEmbeddingRef = React.useRef(false);

  const appliedSizeRef = React.useRef({ w: 0, h: 0 });

  // Gates
  const isTransitioningRef = React.useRef(false);
  const isScrollingRef = React.useRef(false);
  const scrollEndTimerRef = React.useRef(0);
  const transitionEndTimerRef = React.useRef(0);

  const [error, setError] = React.useState(null);

  const computeContext = React.useCallback(() => {
    const el = containerRef.current;
    const inModal = !!el?.closest?.(".modal");
    const inDashboard =
      !!el?.closest?.(".dashboard-widget") ||
      !!el?.closest?.(".dashboard-widget-modal");
    const inConvo = !inDashboard;
    return { inModal, inDashboard, inConvo };
  }, []);

  const getSlot = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return null;

    const explicit =
      el.closest?.(".vega-chart-slot") ||
      el.closest?.(".vega-chart-container-slot");
    if (explicit) return explicit;

    const dashCapture = el.closest?.(".dashboard-widget-capture");
    if (dashCapture) return dashCapture;

    return el.parentElement || el;
  }, []);

  const getSlotSize = React.useCallback(() => {
    const slot = getSlot();
    if (!slot) return { w: 0, h: 0 };
    return {
      w: Math.floor(slot.clientWidth || 0),
      h: Math.floor(slot.clientHeight || 0),
    };
  }, [getSlot]);

  const finalizeView = React.useCallback(() => {
    try {
      if (cleanupRef.current.removeMouseMove)
        cleanupRef.current.removeMouseMove();
    } catch {
      // ignore
    }
    cleanupRef.current.removeMouseMove = null;

    if (viewRef.current) {
      try {
        viewRef.current.finalize();
      } catch {
        // ignore
      }
      viewRef.current = null;
    }

    appliedSizeRef.current = { w: 0, h: 0 };
  }, []);

  const applyMinHeightForConvo = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { inConvo, inModal } = computeContext();

    // Only stabilize convo bubbles
    if (inConvo && !inModal) el.style.minHeight = "340px";
    else el.style.minHeight = "";
  }, [computeContext]);

  const resizeExistingView = React.useCallback(async (w, h) => {
    if (!viewRef.current) return;

    try {
      if (typeof viewRef.current.width === "function") viewRef.current.width(w);
      if (typeof viewRef.current.height === "function")
        viewRef.current.height(h);

      if (typeof viewRef.current.resize === "function")
        viewRef.current.resize();

      // Use run (sync) if available to reduce perceived jank; otherwise runAsync.
      if (typeof viewRef.current.run === "function") viewRef.current.run();
      else if (typeof viewRef.current.runAsync === "function")
        await viewRef.current.runAsync();
    } catch {
      // ignore
    }
  }, []);

  const shouldBlockResize = React.useCallback(() => {
    const { inDashboard } = computeContext();
    if (!inDashboard) return false;
    if (isTransitioningRef.current) return true;
    if (isScrollingRef.current) return true;
    return false;
  }, [computeContext]);

  const scheduleResize = React.useCallback(
    (reason = "ro") => {
      const { inModal, inConvo, inDashboard } = computeContext();

      if (shouldBlockResize()) return;

      const debounceMs = inDashboard ? 320 : 160;

      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);

      resizeTimerRef.current = window.setTimeout(() => {
        if (shouldBlockResize()) return;

        if (rafResizeRef.current) cancelAnimationFrame(rafResizeRef.current);

        rafResizeRef.current = requestAnimationFrame(async () => {
          if (shouldBlockResize()) return;

          const { w, h } = getSlotSize();
          if (w <= 10) return;

          const specH = getNumericHeightFromSpec(spec);
          const fallbackH = inModal ? 520 : inConvo ? 340 : 260;
          const resolvedH = h > 10 ? h : Math.max(180, specH || 0, fallbackH);

          const safeW = clamp(w, 120, 2400);
          const safeH = clamp(resolvedH, 180, 2400);

          const prev = appliedSizeRef.current;
          const dw = Math.abs(safeW - prev.w);
          const dh = Math.abs(safeH - prev.h);

          // VERY strong hysteresis in dashboard to kill flicker.
          const THRESH_W = inDashboard ? 48 : 12;
          const THRESH_H = inDashboard ? 48 : 12;

          if (viewRef.current && prev.w > 0 && dw < THRESH_W && dh < THRESH_H)
            return;

          appliedSizeRef.current = { w: safeW, h: safeH };

          if (viewRef.current) {
            await resizeExistingView(safeW, safeH);
          }
        });
      }, debounceMs);
    },
    [computeContext, getSlotSize, resizeExistingView, spec, shouldBlockResize]
  );

  // Embed once per spec change
  React.useEffect(() => {
    if (!spec || !containerRef.current) return;

    let cancelled = false;
    setError(null);
    applyMinHeightForConvo();

    const runEmbed = async () => {
      if (isEmbeddingRef.current) return;
      isEmbeddingRef.current = true;

      try {
        const el = containerRef.current;
        if (!el) return;

        const { inModal, inConvo } = computeContext();
        const { w, h } = getSlotSize();
        if (w <= 10) return;

        const specH = getNumericHeightFromSpec(spec);
        const fallbackH = inModal ? 520 : inConvo ? 340 : 260;
        const resolvedH = h > 10 ? h : Math.max(180, specH || 0, fallbackH);

        const safeW = clamp(w, 120, 2400);
        const safeH = clamp(resolvedH, 180, 2400);

        appliedSizeRef.current = { w: safeW, h: safeH };

        finalizeView();
        el.innerHTML = "";

        const mod = await import("vega-embed");
        const embed = mod.default || mod;

        const tipMod = await import("vega-tooltip");
        const Handler = tipMod.Handler || tipMod.default?.Handler;
        if (!Handler) throw new Error("Missing vega-tooltip Handler");

        const isNarrow = safeW < 520;

        const tooltipHandler = new Handler({
          anchor: inModal ? "mark" : "cursor",
          offsetX: 12,
          offsetY: 12,
          theme: "dark",
          id: "vg-tooltip-element",
          styleId: "vega-tooltip-style",
        });

        const normalized = normalizeSpec(spec, { inModal, isNarrow });
        normalized.width = safeW;
        normalized.height = safeH;

        const result = await embed(el, normalized, {
          actions: false,
          renderer: "canvas",
          tooltip: tooltipHandler.call,
        });

        if (cancelled) return;

        viewRef.current = result.view;

        // settle once after embed
        await resizeExistingView(safeW, safeH);

        // Cursor handling
        const setCursor = (cursor) => {
          const canvas = el.querySelector("canvas");
          if (canvas) canvas.style.cursor = cursor;
        };
        setCursor("default");

        const onMove = (_event, item) =>
          setCursor(item ? "pointer" : "default");

        if (typeof result.view.addEventListener === "function") {
          result.view.addEventListener("mousemove", onMove);
          cleanupRef.current.removeMouseMove = () => {
            try {
              result.view.removeEventListener("mousemove", onMove);
            } catch {
              // ignore
            }
          };
        }

        if (typeof onViewReady === "function") onViewReady(result.view);
      } catch {
        if (!cancelled) {
          setError(
            "Unable to render chart visualization. Please refer to the textual explanation."
          );
        }
      } finally {
        isEmbeddingRef.current = false;
      }
    };

    runEmbed();

    return () => {
      cancelled = true;
      isEmbeddingRef.current = false;
      finalizeView();
    };
  }, [
    spec,
    onViewReady,
    computeContext,
    getSlotSize,
    finalizeView,
    resizeExistingView,
    applyMinHeightForConvo,
  ]);

  // ResizeObserver (no re-embed)
  React.useEffect(() => {
    if (!spec || !containerRef.current) return;

    try {
      roRef.current = new ResizeObserver(() => {
        if (shouldBlockResize()) return;
        applyMinHeightForConvo();
        scheduleResize("ro");
      });

      const observeEl = getSlot() || containerRef.current;
      roRef.current.observe(observeEl);
    } catch {
      // ignore
    }

    scheduleResize("init");

    return () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = 0;

      if (rafResizeRef.current) cancelAnimationFrame(rafResizeRef.current);
      rafResizeRef.current = 0;

      if (roRef.current) {
        try {
          roRef.current.disconnect();
        } catch {
          // ignore
        }
        roRef.current = null;
      }
    };
  }, [
    spec,
    getSlot,
    scheduleResize,
    applyMinHeightForConvo,
    shouldBlockResize,
  ]);

  // Dashboard: Pause resizing while scrolling
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { inDashboard } = computeContext();
    if (!inDashboard) return;

    const scrollHost = findScrollParent(el);

    const onScroll = () => {
      isScrollingRef.current = true;

      if (scrollEndTimerRef.current)
        window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        isScrollingRef.current = false;
        scheduleResize("scroll-end");
      }, 180);
    };

    if (scrollHost === window)
      window.addEventListener("scroll", onScroll, { passive: true });
    else scrollHost.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (scrollEndTimerRef.current)
        window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = 0;

      if (scrollHost === window) window.removeEventListener("scroll", onScroll);
      else scrollHost.removeEventListener("scroll", onScroll);
    };
  }, [computeContext, scheduleResize]);

  // Dashboard: Pause resizing during the *real* swap transition host (auto-detected)
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const { inDashboard } = computeContext();
    if (!inDashboard) return;

    const startFrom =
      el.closest?.(".dashboard-widget") ||
      el.closest?.(".dashboard-widget-modal") ||
      el;

    const host = findTransitionHost(startFrom);
    if (!host) return;

    const markStart = (e) => {
      if (e?.propertyName && e.propertyName !== "transform") return;
      isTransitioningRef.current = true;

      if (transitionEndTimerRef.current)
        window.clearTimeout(transitionEndTimerRef.current);
      transitionEndTimerRef.current = 0;
    };

    const markEnd = (e) => {
      if (e?.propertyName && e.propertyName !== "transform") return;

      if (transitionEndTimerRef.current)
        window.clearTimeout(transitionEndTimerRef.current);
      transitionEndTimerRef.current = window.setTimeout(() => {
        isTransitioningRef.current = false;
        scheduleResize("transition-end");
      }, 160);
    };

    host.addEventListener("transitionrun", markStart);
    host.addEventListener("transitionstart", markStart);
    host.addEventListener("transitionend", markEnd);
    host.addEventListener("transitioncancel", markEnd);

    return () => {
      if (transitionEndTimerRef.current)
        window.clearTimeout(transitionEndTimerRef.current);
      transitionEndTimerRef.current = 0;

      host.removeEventListener("transitionrun", markStart);
      host.removeEventListener("transitionstart", markStart);
      host.removeEventListener("transitionend", markEnd);
      host.removeEventListener("transitioncancel", markEnd);
    };
  }, [computeContext, scheduleResize]);

  if (error) return <div className="vega-chart-error">{error}</div>;

  return <div className="vega-chart-container" ref={containerRef} />;
}
