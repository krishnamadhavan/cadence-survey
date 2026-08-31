"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { logoutAdmin } from "@/app/admin/login/actions";

const NAV = [
  { href: "/admin", label: "Surveys", match: "surveys", icon: SurveysIcon },
  {
    href: "/admin/employees",
    label: "Employees",
    match: "employees",
    icon: EmployeesIcon,
  },
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
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={() => setOpen(false)}
                className={`flex items-center rounded-xl py-2 text-sm font-medium transition-colors ${
                  collapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  active
                    ? "bg-accent/10 text-ink"
                    : "text-ink/60 hover:bg-ink/5 hover:text-ink"
                }`}
              >
                <Icon />
                {collapsed ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  item.label
                )}
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
          <ProfileMenu email={email} />
        </header>
        <div className="flex-1 px-4 py-8 md:px-8">{children}</div>
      </div>
    </div>
  );
}

function ProfileMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initial = (email.trim()[0] ?? "A").toUpperCase();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white/70 text-sm font-medium text-ink transition-colors hover:border-ink/40"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sr-only">Open profile menu</span>
        {initial}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-lg"
        >
          <div className="border-b border-ink/10 px-4 py-3">
            <p className="text-xs tracking-wide text-ink/45 uppercase">
              Signed in
            </p>
            <p className="mt-1 truncate text-sm font-medium text-ink">{email}</p>
          </div>
          <Link
            href="/admin/profile"
            role="menuitem"
            className="block px-4 py-2.5 text-sm text-ink/80 hover:bg-ink/5"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <form action={logoutAdmin}>
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-ink/80 hover:bg-ink/5"
            >
              Log out
            </button>
          </form>
        </div>
      ) : null}
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
  if (pathname.startsWith("/admin/profile")) {
    return "Profile";
  }
  if (pathname.startsWith("/admin/s/")) {
    return "Results";
  }
  return "Surveys";
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
