export function fmtMoney(amount: number | string | { toString(): string }): string {
  const n = typeof amount === "number" ? amount : Number(amount.toString());
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US");
}

// Display-time normalization for names that arrive in inconsistent case from
// various source systems ("SMITH JOHN" / "smith john" / "Smith John"). We do
// NOT normalize on insert — the source data is preserved verbatim in the
// encrypted blob, and only the display layer enforces a consistent shape.
// Word boundaries cover both spaces and hyphens so "Gregson-Park" survives.
export function fmtName(name: string | undefined | null): string {
  if (!name) return "";
  return name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
