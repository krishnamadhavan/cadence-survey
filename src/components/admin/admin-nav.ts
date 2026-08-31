export function sidebarWidthClass(collapsed: boolean) {
  return collapsed ? "w-56 md:w-16" : "w-56";
}

export type NavItemDef = {
  href: string;
  label: string;
};

export type NavSectionDef = {
  id: string;
  label: string;
  items: NavItemDef[];
};

export const NAV_SECTIONS: NavSectionDef[] = [
  {
    id: "insights",
    label: "Insights",
    items: [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/reports", label: "Reports" },
      { href: "/admin/recommendations", label: "Recommendations" },
    ],
  },
  {
    id: "listen",
    label: "Listen",
    items: [
      { href: "/admin", label: "Surveys" },
      { href: "/admin/feedbacks", label: "Feedbacks" },
      { href: "/admin/templates", label: "Templates" },
    ],
  },
  {
    id: "act",
    label: "Act",
    items: [
      { href: "/admin/action-plans", label: "Action Plans" },
    ],
  },
  {
    id: "people",
    label: "People",
    items: [
      { href: "/admin/employees", label: "Employees" },
      { href: "/admin/managers", label: "Managers" },
      { href: "/admin/teams", label: "Teams" },
      { href: "/admin/org-chart", label: "Org Chart" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/integrations", label: "Integrations" },
      { href: "/admin/audit-log", label: "Audit Log" },
      { href: "/admin/settings", label: "Settings" },
    ],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
);

export function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/s/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type Crumb = {
  label: string;
  href?: string;
};

export function breadcrumbs(pathname: string): Crumb[] {
  if (pathname.startsWith("/admin/s/")) {
    return [
      { label: "Listen", href: "/admin" },
      { label: "Surveys", href: "/admin" },
      { label: "Results" },
    ];
  }
  if (pathname.startsWith("/admin/profile")) {
    return [{ label: "Admin" }, { label: "Profile" }];
  }
  const current = NAV_ITEMS.find((item) => isActivePath(pathname, item.href));
  if (!current) {
    return [{ label: "Listen", href: "/admin" }, { label: "Surveys" }];
  }
  return [
    { label: current.section, href: current.href },
    { label: current.label },
  ];
}

export function initialsFromEmail(email: string) {
  const local = email.trim().split("@")[0] ?? "";
  const parts = local.split(/[._+\-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  const letters = local.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2) {
    return letters.slice(0, 2).toUpperCase();
  }
  if (letters.length === 1) {
    return `${letters}A`.toUpperCase();
  }
  return "AD";
}
