// src/components/artifacts/KVTable.jsx
import React, { useMemo, useState } from "react";

export default function KVTable({ kv, sortable = true }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const columns = (kv?.metadata?.columns || []).filter(Boolean);
  const cols = kv?.data?.values || [];
  if (!columns.length || !cols.length) return null;

  const formatValue = (key, value) => {
    if (value === null || value === undefined) return "";
    const raw = String(value).trim();
    if (!raw) return "";

    const n = Number(raw);
    if (!Number.isNaN(n)) {
      if (Number.isInteger(n)) return n.toString();
      return n.toString();
    }

    if (!Number.isNaN(Date.parse(raw)) && /T\d{2}:\d{2}/.test(raw)) {
      return raw;
    }

    return raw;
  };

  const rows = [];
  const maxLen = Math.max(...cols.map((c) => c.values?.length || 0));
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    for (let c = 0; c < cols.length; c++) {
      const colKey = columns[c] || Object.keys(cols[c])[0];
      const val = cols[c].values?.[i];
      row[colKey] = formatValue(colKey, val);
    }
    rows.push(row);
  }

  const detectType = (v) => {
    if (v === "" || v == null) return "string";
    if (!isNaN(Number(v))) return "number";
    if (!isNaN(Date.parse(v))) return "date";
    return "string";
  };

  const handleSort = (key) => {
    if (!sortable) return;
    if (key === sortKey) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortable) return rows;
    const t = detectType(rows[0]?.[sortKey]);
    const copy = [...rows];

    copy.sort((a, b) => {
      const A = a[sortKey];
      const B = b[sortKey];
      if (t === "number") return Number(A) - Number(B);
      if (t === "date") return new Date(A) - new Date(B);
      return String(A).localeCompare(String(B));
    });

    return sortAsc ? copy : copy.reverse();
  }, [rows, sortKey, sortAsc, sortable]);

  return (
    <div className="kv-table-wrapper">
      <table className="kv-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className={
                  sortable && sortKey === col
                    ? sortAsc
                      ? "sorted-asc"
                      : "sorted-desc"
                    : ""
                }
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{row[col]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
