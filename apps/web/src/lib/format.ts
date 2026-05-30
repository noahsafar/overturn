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
