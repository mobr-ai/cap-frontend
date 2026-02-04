// src/utils/kvCharts/specs/bubble.js
import { safeColumns } from "../helpers.js";

export function kvToBubbleChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);

  const xField = "x";
  const yField = "y";
  const sizeField = "size";
  const labelField = "label";

  const xTitle = cols[0] || "X";
  const yTitle = cols[1] || "Y";
  const sizeTitle = cols[2] || "Size";
  const labelTitle = cols[3] || "Label";

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bubble chart from kv_results",
    data: { values },

    width: "container",
    height: 320,
    autosize: { type: "fit", contains: "padding" },

    config: {
      view: { stroke: null },
      axis: {
        grid: true,
        gridOpacity: 0.12,
        domain: false,
        tickSize: 4,
        labelFontSize: 11,
        titleFontSize: 12,
        labelPadding: 6,
        titlePadding: 10,
      },
      legend: {
        labelFontSize: 11,
        titleFontSize: 12,
        symbolStrokeWidth: 1,
      },
    },

    transform: [
      {
        calculate: `isValid(datum.${labelField}) ? replace(datum.${labelField}, '^.*[/#]', '') : ''`,
        as: "__shortLabel",
      },
      {
        calculate: `length(datum.__shortLabel) > 28 ? substring(datum.__shortLabel, 0, 26) + '…' : datum.__shortLabel`,
        as: "__shortLabel2",
      },
    ],

    layer: [
      {
        mark: {
          type: "point",
          filled: true,
          opacity: 0.18,
          stroke: "white",
          strokeWidth: 2,
        },
        encoding: {
          x: {
            field: xField,
            type: "quantitative",
            title: xTitle,
            scale: { zero: false },
          },
          y: {
            field: yField,
            type: "quantitative",
            title: yTitle,
            scale: { zero: false },
          },
          size: {
            field: sizeField,
            type: "quantitative",
            title: sizeTitle,
            scale: { type: "sqrt", range: [40, 1800] },
            legend: { orient: "right" },
          },
        },
      },
      {
        mark: {
          type: "point",
          filled: true,
          opacity: 0.72,
          stroke: "rgba(0,0,0,0.28)",
          strokeWidth: 1,
        },
        encoding: {
          x: {
            field: xField,
            type: "quantitative",
            title: xTitle,
            scale: { zero: false },
          },
          y: {
            field: yField,
            type: "quantitative",
            title: yTitle,
            scale: { zero: false },
          },
          size: {
            field: sizeField,
            type: "quantitative",
            title: sizeTitle,
            scale: { type: "sqrt", range: [40, 1800] },
            legend: { orient: "right" },
          },
          color: {
            field: sizeField,
            type: "quantitative",
            title: sizeTitle,
            scale: { scheme: "viridis" },
            legend: null,
          },
          tooltip: [
            { field: "__shortLabel2", type: "nominal", title: labelTitle },
            { field: labelField, type: "nominal", title: "URI" },
            { field: xField, type: "quantitative", title: xTitle },
            { field: yField, type: "quantitative", title: yTitle },
            { field: sizeField, type: "quantitative", title: sizeTitle },
          ],
        },
      },
    ],
  };
}
