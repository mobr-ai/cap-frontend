// src/utils/kvCharts.js

const safeColumns = (kv) =>
  Array.isArray(kv?.metadata?.columns)
    ? kv.metadata.columns.filter(Boolean)
    : [];

const uniqueCount = (arr) => {
  const s = new Set();
  for (const v of arr || []) s.add(String(v));
  return s.size;
};

const shortSeries = (s) =>
  String(s).length > 18 ? String(s).slice(0, 16) + "…" : String(s);

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

  // If metadata.columns matches the number of slices, prefer it for labels.
  // This fixes: "topHolders" -> "Top Holders"
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

export function kvToLineChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const toTemporalMonth = (v) => {
    if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
    return v;
  };

  const looksLong = keys.includes("x") && keys.includes("y");

  const seriesNameForIndex = (idx) => {
    const n = Number(idx);
    if (Number.isNaN(n)) return null;

    // Two common layouts:
    // A) columns = [x, s1, s2, ...]  -> series index maps to columns[n + 1]
    // B) columns = [s1, s2, ...]     -> series index maps to columns[n]
    if (cols.length >= 2) {
      const a = cols[n + 1];
      const b = cols[n];
      return a || b || null;
    }
    return null;
  };

  let prepared = [];

  if (looksLong) {
    prepared = values.map((row, i) => {
      const direct = row.series != null ? row.series : null;
      const fromC = row.c != null ? seriesNameForIndex(row.c) : null;

      const series =
        (direct != null && String(direct)) ||
        (fromC != null && String(fromC)) ||
        `series_${i}`;

      return {
        x: toTemporalMonth(row.x),
        y: row.y,
        series: shortSeries(series),
      };
    });
  } else {
    const xField = cols[0] || keys[0];
    const measureFields = (
      cols.length >= 2 ? cols.slice(1) : keys.slice(1)
    ).filter((f) => f !== xField);

    prepared = values.flatMap((row) => {
      const xVal = toTemporalMonth(row[xField]);
      return measureFields.map((mf) => ({
        x: xVal,
        y: row[mf],
        series: shortSeries(mf),
      }));
    });
  }

  const seriesCount = uniqueCount(prepared.map((r) => r.series));
  const showLegend = seriesCount > 1;

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Line chart from kv_results",
    data: { values: prepared },
    mark: "line",
    encoding: {
      x: { field: "x", type: "temporal", title: cols[0] || "Time" },
      y: { field: "y", type: "quantitative", title: "Value" },
      color: showLegend
        ? {
            field: "series",
            type: "nominal",
            title: null,
            legend: { title: null },
          }
        : undefined,
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
