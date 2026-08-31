"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAdmin } from "@/app/admin/login/actions";

const NAV = [
  { href: "/admin", label: "Surveys", match: "surveys" },
  { href: "/admin/employees", label: "Employees", match: "employees" },
] as const;

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
    <div className="flex min-h-dvh bg-paper">
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-ink/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-ink/10 bg-paper transition-[width,transform] duration-200 md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-60 md:w-16" : "w-60"}`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-ink/10 ${
            collapsed ? "justify-center px-2" : "px-5"
          }`}
        >
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="font-serif text-xl text-ink"
            title="Cadence"
          >
            {collapsed ? "C" : "Cadence"}
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={() => setOpen(false)}
                className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                  collapsed ? "px-0 text-center" : "px-3"
                } ${
                  active
                    ? "bg-accent/10 text-ink"
                    : "text-ink/60 hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {collapsed ? item.label.slice(0, 1) : item.label}
              </Link>
            );
          })}
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

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-ink/10 bg-paper/90 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-ink md:hidden"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
            >
              <MenuIcon />
            </button>
            <p className="truncate text-sm font-medium text-ink/70">
              {pageTitle(pathname)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden truncate text-sm text-ink/50 sm:inline">
              {email}
            </span>
            <form action={logoutAdmin}>
              <button
                type="submit"
                className="rounded-full border border-ink/15 px-3 py-1.5 text-sm text-ink/70 transition-colors hover:border-ink/40 hover:text-ink"
              >
                Log out
              </button>
            </form>
          </div>
        </header>
        <div className="flex-1 px-4 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}

function isActive(pathname: string, match: (typeof NAV)[number]["match"]) {
  if (match === "employees") {
    return pathname.startsWith("/admin/employees");
  }
  return pathname === "/admin" || pathname.startsWith("/admin/s/");
}

function pageTitle(pathname: string) {
  if (pathname.startsWith("/admin/employees")) {
    return "Employees";
  }
  if (pathname.startsWith("/admin/s/")) {
    return "Results";
  }
  return "Surveys";
}

function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4h12M2 8h12M2 12h12"
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
