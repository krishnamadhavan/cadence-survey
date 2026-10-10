export const ADMIN_ROLES = ["admin", "viewer"] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const VIEW_ONLY_MESSAGE = "You have view-only access.";

const VIEWER_PAGES = ["/admin/dashboard", "/admin/reports", "/admin/profile"];

export function parseAdminRole(value: unknown): AdminRole | null {
  if (value === "admin" || value === "viewer") {
    return value;
  }
  return null;
}

export function coerceAdminRole(value: unknown): AdminRole {
  return value === "admin" ? "admin" : "viewer";
}

export function adminRoleLabel(role: AdminRole): string {
  return role === "viewer" ? "Viewer" : "Admin";
}

export function viewerMayOpen(pathname: string): boolean {
  const path = adminPathname(pathname);
  return VIEWER_PAGES.some((page) => path === page || path.startsWith(`${page}/`));
}

export function adminLandingPath(
  role: AdminRole,
  rawNext: string | null | undefined,
): string {
  const fallback = role === "viewer" ? "/admin/dashboard" : "/admin";
  if (!rawNext || !rawNext.startsWith("/admin")) {
    return fallback;
  }
  const path = adminPathname(rawNext);
  if (path === "/admin/login" || path.startsWith("/admin/login/")) {
    return fallback;
  }
  if (role === "viewer" && !viewerMayOpen(path)) {
    return "/admin/dashboard";
  }
  return rawNext;
}

function adminPathname(raw: string): string {
  const withoutHash = raw.split("#")[0] ?? raw;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}
