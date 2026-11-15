/** SQLite can return UTC timestamps without an offset; do not interpret them as browser-local time. */
export function parseTimestamp(value: string | null): number {
  if (!value) return NaN;
  const normalized = value.replace(" ", "T");
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}T/.test(normalized) &&
      !/(Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
      ? normalized + "Z"
      : normalized,
  );
}
