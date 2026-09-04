const SLUG_MAX = 64;

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

export function parseTeamSlug(value: string): string | null {
  const slug = slugifyTeam(value);
  if (slug.length < 1) {
    return null;
  }
  return slug;
}
