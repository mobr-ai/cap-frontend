import React from "react";

export default function KVTable({ kv }) {
  const columns = kv?.metadata?.columns || [];
  const cols = kv?.data?.values || [];
  if (!columns.length || !cols.length) return null;

  const rows = [];
  const maxLen = Math.max(...cols.map((c) => (c.values || []).length));
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    for (let c = 0; c < cols.length; c++) {
      const key = columns[c] || Object.keys(cols[c])[0];
      row[key] = cols[c].values?.[i] ?? "";
    }
    rows.push(row);
  }

  return (
    <div className="kv-table-wrapper">
      <table className="kv-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
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
