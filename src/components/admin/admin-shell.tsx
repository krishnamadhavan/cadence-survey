"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  isActivePath,
  NAV_SECTIONS,
  sidebarWidthClass,
} from "@/components/admin/admin-nav";
import { AdminTopbar } from "@/components/admin/admin-topbar";

const NAV_ICONS: Record<string, () => React.ReactNode> = {
  "/admin/dashboard": DashboardIcon,
  "/admin": SurveysIcon,
  "/admin/feedbacks": FeedbacksIcon,
  "/admin/reports": ReportsIcon,
  "/admin/recommendations": RecommendationsIcon,
  "/admin/action-plans": ActionPlansIcon,
  "/admin/templates": TemplatesIcon,
  "/admin/employees": EmployeesIcon,
  "/admin/managers": ManagersIcon,
  "/admin/teams": TeamsIcon,
  "/admin/org-chart": OrgChartIcon,
  "/admin/users": UsersIcon,
  "/admin/integrations": IntegrationsIcon,
  "/admin/audit-log": AuditLogIcon,
  "/admin/settings": SettingsIcon,
};

const COLLAPSE_COOKIE = "cadence_sidebar";

type AdminShellProps = {
  email: string;
  sidebarCollapsed?: boolean;
  children: React.ReactNode;
};

export function AdminShell({
  email,
  sidebarCollapsed = false,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COLLAPSE_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <AdminTopbar
        email={email}
        collapsed={collapsed}
        onOpenMobile={() => setOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        {open ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-x-0 top-14 bottom-0 z-20 bg-ink/30 md:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <aside
          className={`fixed top-14 bottom-0 left-0 z-30 flex shrink-0 flex-col border-r border-ink/10 bg-paper transition-[width,transform] duration-200 md:sticky md:top-14 md:h-[calc(100dvh-3.5rem)] md:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          } ${sidebarWidthClass(collapsed)}`}
        >
          <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2">
            {NAV_SECTIONS.map((section, index) => (
              <div
                key={section.id}
                role="group"
                aria-labelledby={`nav-${section.id}`}
                className={index === 0 ? "" : "mt-3"}
              >
                <p
                  id={`nav-${section.id}`}
                  className={`px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-ink/40 uppercase ${
                    collapsed ? "md:hidden" : ""
                  }`}
                >
                  {section.label}
                </p>
                {collapsed ? (
                  <div
                    className={`mx-auto mb-2 hidden h-px w-6 bg-ink/10 md:block ${
                      index === 0 ? "mt-1" : ""
                    }`}
                    aria-hidden
                  />
                ) : null}
                <div className="flex flex-col gap-0.5">
                  {section.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const Icon = NAV_ICONS[item.href];
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.label}
                        onClick={() => setOpen(false)}
                        className={`flex items-center rounded-xl py-1.5 text-sm font-medium transition-colors ${
                          collapsed
                            ? "justify-center px-3 md:px-0"
                            : "gap-3 px-3"
                        } ${
                          active
                            ? "bg-accent/10 text-ink"
                            : "text-ink/60 hover:bg-ink/5 hover:text-ink"
                        }`}
                      >
                        {Icon ? <Icon /> : null}
                        <span className={collapsed ? "md:sr-only" : undefined}>
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto shrink-0 border-t border-ink/10 p-2">
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`hidden w-full items-center rounded-xl py-2 text-sm text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink md:flex ${
                collapsed ? "justify-center px-0" : "justify-between px-3"
              }`}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ExpandIcon />
              ) : (
                <>
                  <span>Collapse</span>
                  <CollapseIcon />
                </>
              )}
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}

function SurveysIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5 6.5h6M5 9.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8.5" y="2.5" width="5" height="3.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8.5" y="7" width="5" height="6.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FeedbacksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 3.5h9A1.5 1.5 0 0 1 14 5v5a1.5 1.5 0 0 1-1.5 1.5H8L4.5 14v-2.5H3.5A1.5 1.5 0 0 1 2 10V5A1.5 1.5 0 0 1 3.5 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RecommendationsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5 9.2 6h3.6L10 8.2l1.1 3.6L8 9.7 4.9 11.8 6 8.2 3.2 6h3.6L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActionPlansIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5 8 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ManagersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 13c.5-2.3 2.3-3.5 4.5-3.5s4 1.2 4.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 3.5 12.6 4.7 14 5l-1.1.9.3 1.3L12 6.6 10.8 7.2l.3-1.3L10 5l1.4-.3L12 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function OrgChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.5" y="1.5" width="5" height="3.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.5" y="11" width="5" height="3.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9.5" y="11" width="5" height="3.5" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 5v2.5M4 10.5V8.5h8v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IntegrationsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6.5 3.5H4A1.5 1.5 0 0 0 2.5 5v2.5M9.5 3.5H12A1.5 1.5 0 0 1 13.5 5v2.5M6.5 12.5H4A1.5 1.5 0 0 1 2.5 11V8.5M9.5 12.5H12a1.5 1.5 0 0 0 1.5-1.5V8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function AuditLogIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="2.5" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 6h4M6 8.5h4M6 11h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 12.5v-3M8 12.5V4.5M12.5 12.5v-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M2.5 13.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 5v7.5A1.5 1.5 0 0 0 5 14h6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="4.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4" cy="11" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="11" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 5.5 4.8 9.2M9.5 5.5l1.7 3.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 13c.5-2.3 2.3-3.5 4.5-3.5s4 1.2 4.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.1 4.1l1.1 1.1M10.8 10.8l1.1 1.1M11.9 4.1l-1.1 1.1M5.2 10.8l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 4 6 8l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmployeesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 12.5c.4-2 1.9-3 3.5-3s3.1 1 3.5 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M11 9.5c1.4.2 2.6 1.1 3 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}


