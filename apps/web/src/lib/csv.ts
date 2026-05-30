// Minimal RFC-4180 CSV serializer. Used for our report exports.
// Avoids adding a CSV library since we only need to write, never parse.

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) {
    return (headers ?? []).join(",") + "\n";
  }
  const cols = headers ?? Object.keys(rows[0]!);
  const escapeCell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s: string;
    if (v instanceof Date) s = v.toISOString();
    else if (typeof v === "object") s = JSON.stringify(v);
    else s = String(v);
    // Escape if needed
    if (/[",\n\r]/.test(s)) {
      s = `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  }
  return lines.join("\n") + "\n";
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
