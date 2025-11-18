// src/components/artifacts/VegaChart.jsx
import React from "react";

function normalizeSpec(spec) {
  if (!spec) return spec;

  const copy =
    typeof structuredClone === "function"
      ? structuredClone(spec)
      : JSON.parse(JSON.stringify(spec));

  if (typeof copy.$schema === "string") {
    copy.$schema = copy.$schema
      .replace("vega-lite/v4.json", "vega-lite/v6.json")
      .replace("vega-lite/v5.json", "vega-lite/v6.json");
  }

  copy.autosize = {
    type: "fit",
    contains: "padding",
    resize: true,
    ...(copy.autosize || {}),
  };

  return copy;
}

export default function VegaChart({ spec }) {
  const containerRef = React.useRef(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!spec || !containerRef.current) return;

    let cancelled = false;
    let view = null;

    (async () => {
      try {
        const mod = await import("vega-embed");
        const embed = mod.default || mod;
        if (cancelled) return;

        const result = await embed(containerRef.current, normalizeSpec(spec), {
          actions: false,
          renderer: "canvas",
        });
        view = result.view;
      } catch (err) {
        if (!cancelled) {
          setError(
            "Unable to render chart visualization. Please refer to the textual explanation."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (view) {
        try {
          view.finalize();
        } catch {
          // ignore
        }
      }
    };
  }, [spec]);

  if (error) {
    return <div className="vega-chart-error">{error}</div>;
  }

  return <div className="vega-chart-container" ref={containerRef} />;
}
