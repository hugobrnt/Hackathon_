const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** A platform metric. `null` means "not available yet", which differs from 0. */
export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : compact.format(value);
}

export function formatPercent(value: number): string {
  return percent.format(value);
}

export function formatScore(value: number): string {
  return value.toFixed(2);
}

export function formatDate(value: string | null): string {
  return value ? date.format(new Date(value)) : "—";
}

export function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
