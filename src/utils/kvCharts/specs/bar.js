// src/utils/kvCharts/specs/bar.js
import { safeColumns } from "../helpers.js";

export function kvToBarChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);

  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const xField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const yFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("amount")) ||
    keys.find((k) => k.toLowerCase().includes("value"));
  const yField = yFieldCandidate || keys[1] || keys[0];

  const xTitle = cols[0] || xField;
  const yTitle = cols[1] || yField;

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bar chart from kv_results",
    data: { values },
    mark: "bar",
    encoding: {
      x: { field: xField, type: "ordinal", title: xTitle },
      y: { field: yField, type: "quantitative", title: yTitle },
      tooltip: [
        { field: xField, type: "ordinal", title: xTitle },
        { field: yField, type: "quantitative", title: yTitle },
      ],
    },
  };
}
