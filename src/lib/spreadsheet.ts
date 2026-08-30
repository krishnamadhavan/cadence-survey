const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeSpreadsheetValue(
  value: string | number | null | undefined,
): string | number {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function sanitizeFilenameToken(token: string): string {
  const cleaned = token.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "survey";
}
