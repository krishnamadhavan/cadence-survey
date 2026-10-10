import { normalizeEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;

export function parseDisplayName(
  value: unknown,
): { ok: true; name: string | null } | { ok: false; error: string } {
  if (value != null && typeof value !== "string") {
    return { ok: false, error: "Enter a display name on one line." };
  }
  const name = String(value ?? "").trim();
  if (!name) {
    return { ok: true, name: null };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: "Display name must be 80 characters or fewer." };
  }
  if (/[\u0000-\u001F\u007F]/.test(name)) {
    return { ok: false, error: "Enter a display name on one line." };
  }
  return { ok: true, name };
}

export function parseAdminEmail(
  value: unknown,
): { ok: true; email: string } | { ok: false; error: string } {
  if (value != null && typeof value !== "string") {
    return { ok: false, error: "Enter a valid email address." };
  }
  const email = normalizeEmail(String(value ?? ""));
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  return { ok: true, email };
}

export function displayNameFromRow(value: string | null | undefined): string | null {
  const name = value?.trim() ?? "";
  return name ? name : null;
}

export function adminProfileSummary(input: {
  previousEmail: string;
  email: string;
  previousName: string | null;
  name: string | null;
}): string {
  const parts: string[] = [];
  if (input.email !== input.previousEmail) {
    parts.push(`Changed email from ${input.previousEmail} to ${input.email}`);
  }
  if (input.name !== input.previousName) {
    parts.push(
      input.name ? `Set display name to ${input.name}` : "Cleared the display name",
    );
  }
  if (parts.length === 0) {
    return "Updated profile";
  }
  if (parts.length === 1) {
    return parts[0] ?? "Updated profile";
  }
  const second = parts[1] ?? "";
  return `${parts[0]} and ${second[0]?.toLowerCase() ?? ""}${second.slice(1)}`;
}
