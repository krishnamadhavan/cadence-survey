export function safeManagerNext(raw: string | null): string {
  if (
    !raw ||
    raw.includes("\\") ||
    raw.includes("://") ||
    raw.includes("..") ||
    (raw !== "/manage" && !raw.startsWith("/manage/"))
  ) {
    return "/manage";
  }
  return raw;
}
