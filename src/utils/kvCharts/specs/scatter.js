// src/utils/kvCharts/specs/scatter.js
import { safeColumns, inferXYFields, shouldUseLogScale } from "../helpers.js";

export function kvToScatterChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const { xField, yField } = inferXYFields(values, cols);

  const xTitle = cols[0] || xField;
  const yTitle = cols[1] || yField;

  const xs = values.map((r) => r?.[xField]);
  const ys = values.map((r) => r?.[yField]);

  const useLogX = shouldUseLogScale(xs);
  const useLogY = shouldUseLogScale(ys);

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Scatter chart from kv_results",
    data: { values },
    mark: { type: "point", filled: true, opacity: 0.7 },
    encoding: {
      x: {
        field: xField,
        type: "quantitative",
        title: xTitle,
        scale: useLogX ? { type: "log", zero: false } : { zero: false },
      },
      y: {
        field: yField,
        type: "quantitative",
        title: yTitle,
        scale: useLogY ? { type: "log", zero: false } : { zero: false },
      },
      tooltip: [
        { field: xField, type: "quantitative", title: xTitle },
        { field: yField, type: "quantitative", title: yTitle },
      ],
    },
  };
}
