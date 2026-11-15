import { parseTimestamp } from "./time";
const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export function formatCount(value: number | null | undefined): string {
  return value == null ? "—" : compact.format(value);
}
export function formatPercent(value: number | null): string {
  return value === null ? "—" : percent.format(value);
}
export function formatScore(value: number): string {
  return value.toFixed(2);
}
export function formatDate(value: string | null): string {
  const timestamp = parseTimestamp(value);
  if (!Number.isFinite(timestamp)) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}
export function truncate(text: string, length: number): string {
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}
