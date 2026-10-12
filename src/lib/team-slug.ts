const SLUG_MAX = 64;
export const OFFICE_MAX_LENGTH = 80;

export function slugifyTeam(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX);
}

export function parseTeamName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) {
    return null;
  }
  return name;
}

/**
 * Blank clears the office. Otherwise trim, collapse whitespace, and keep
 * the entered casing. Longer than 80 characters is rejected.
 */
export function parseTeamOffice(
  value: string | null | undefined,
): { ok: true; office: string | null } | { ok: false } {
  const office = (value ?? "").trim().replace(/\s+/g, " ");
  if (!office) {
    return { ok: true, office: null };
  }
  if (office.length > OFFICE_MAX_LENGTH) {
    return { ok: false };
  }
  return { ok: true, office };
}

export function parseTeamSlug(value: string): string | null {
  const slug = slugifyTeam(value);
  if (slug.length < 1) {
    return null;
  }
  return slug;
}
