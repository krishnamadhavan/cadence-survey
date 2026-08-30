export function readLoginClientIp(
  headerStore: { get(name: string): string | null },
  trustProxy: boolean,
): string {
  if (!trustProxy) {
    return "direct";
  }

  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "direct";
  }

  return headerStore.get("x-real-ip")?.trim() || "direct";
}
