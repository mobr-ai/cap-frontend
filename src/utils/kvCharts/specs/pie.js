// src/utils/kvCharts/specs/pie.js
import { safeColumns } from "../helpers.js";

export function kvToPieChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);

  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const catField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const valFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("value")) ||
    keys.find((k) => k.toLowerCase().includes("amount"));
  const valField = valFieldCandidate || keys[1] || keys[0];

  const hasRowLabels = cols.length === values.length;
  const prepared = hasRowLabels
    ? values.map((row, i) => ({
        ...row,
        __label: cols[i] || row?.[catField] || `slice_${i}`,
      }))
    : values;

  const labelField = hasRowLabels ? "__label" : catField;

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Pie chart from kv_results",
    data: { values: prepared },
    mark: "arc",
    encoding: {
      theta: { field: valField, type: "quantitative" },
      color: {
        field: labelField,
        type: "nominal",
        legend: { title: null },
      },
      tooltip: [
        { field: labelField, type: "nominal", title: cols?.[0] || "Category" },
        { field: valField, type: "quantitative", title: cols?.[1] || "Value" },
      ],
    },
    view: { stroke: null },
  };
}
