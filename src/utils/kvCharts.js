// src/utils/kvCharts.js
export function kvToBarChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const sample = values[0];
  const keys = Object.keys(sample);
  const xField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const yFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("amount")) ||
    keys.find((k) => k.toLowerCase().includes("value"));
  const yField = yFieldCandidate || keys[1] || keys[0];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bar chart from kv_results",
    data: { values },
    mark: "bar",
    encoding: {
      x: { field: xField, type: "ordinal", title: xField },
      y: { field: yField, type: "quantitative", title: yField },
      tooltip: [
        { field: xField, type: "ordinal" },
        { field: yField, type: "quantitative" },
      ],
    },
  };
}

export function kvToPieChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const sample = values[0];
  const keys = Object.keys(sample);
  const catField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];
  const valFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("value")) ||
    keys.find((k) => k.toLowerCase().includes("amount"));
  const valField = valFieldCandidate || keys[1] || keys[0];

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Pie chart from kv_results",
    data: { values },
    mark: "arc",
    encoding: {
      theta: { field: valField, type: "quantitative" },
      color: {
        field: catField,
        type: "nominal",
        legend: { title: null },
      },
      tooltip: [
        { field: catField, type: "nominal" },
        { field: valField, type: "quantitative" },
      ],
    },
    view: { stroke: null },
  };
}

export function kvToLineChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const colNames = kv?.metadata?.columns || [];
  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const toTemporalMonth = (v) => {
    if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
    return v;
  };

  // Existing "long" format: {x, y, series?} or {x, y, c}
  const looksLong = keys.includes("x") && keys.includes("y");

  const seriesNameFor = (c) => {
    if (colNames.length >= 3) {
      const idx = Number(c);
      if (!Number.isNaN(idx) && idx + 1 < colNames.length) {
        return colNames[idx + 1];
      }
    }
    return `series_${c}`;
  };

  let prepared = [];

  if (looksLong) {
    prepared = values.map((row) => {
      const series =
        row.series != null
          ? row.series
          : row.c != null
          ? seriesNameFor(row.c)
          : "series";

      return {
        x: toTemporalMonth(row.x),
        y: row.y,
        series,
      };
    });
  } else {
    // Wide format: first column is x, remaining numeric columns are series
    const xField = colNames[0] || keys[0];
    const measureFields = (
      colNames.length >= 2 ? colNames.slice(1) : keys.slice(1)
    ).filter((f) => f !== xField);

    prepared = values.flatMap((row) => {
      const xVal = toTemporalMonth(row[xField]);
      return measureFields.map((mf) => ({
        x: xVal,
        y: row[mf],
        series: mf,
      }));
    });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Line chart from kv_results",
    data: { values: prepared },
    mark: "line",
    encoding: {
      x: {
        field: "x",
        type: "temporal",
        title: colNames[0] || "x",
      },
      y: {
        field: "y",
        type: "quantitative",
        title: "value",
      },
      color: {
        field: "series",
        type: "nominal",
        title: "Series",
      },
      tooltip: [
        { field: "x", type: "temporal" },
        { field: "series", type: "nominal" },
        { field: "y", type: "quantitative" },
      ],
    },
  };
}

export function kvToChartSpec(kv) {
  if (!kv || !kv.result_type) return null;
  switch (kv.result_type) {
    case "bar_chart":
      return kvToBarChartSpec(kv);
    case "pie_chart":
      return kvToPieChartSpec(kv);
    case "line_chart":
      return kvToLineChartSpec(kv);
    default:
      return null;
  }
}
