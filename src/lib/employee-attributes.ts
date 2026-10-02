export const TENURE_BANDS = [
  { value: "lt_1", label: "<1yr" },
  { value: "y1_3", label: "1-3yr" },
  { value: "gte_3", label: "3yr+" },
] as const;

export type TenureBand = (typeof TENURE_BANDS)[number]["value"];

export const ROLE_MAX_LENGTH = 80;

const TENURE_BY_KEY = new Map<string, TenureBand>(
  TENURE_BANDS.flatMap((band) => [
    [tenureKey(band.label), band.value],
    [tenureKey(band.value), band.value],
    [tenureKey(band.label.replace("yr", "")), band.value],
  ]),
);

export function tenureBandLabel(band: TenureBand | null): string {
  if (!band) {
    return "";
  }
  return TENURE_BANDS.find((item) => item.value === band)?.label ?? "";
}

export function parseRole(
  raw: string,
): { ok: true; role: string | null } | { ok: false; error: string } {
  const role = raw.trim().replace(/\s+/g, " ");
  if (!role) {
    return { ok: true, role: null };
  }
  if (role.length > ROLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Role must be ${ROLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, role };
}

// Blank is "not set". Anything else must be one of the three bands.
export function parseTenureBand(raw: string): TenureBand | null | "invalid" {
  const key = tenureKey(raw);
  if (!key) {
    return null;
  }
  return TENURE_BY_KEY.get(key) ?? "invalid";
}

function tenureKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
}
