"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { logoutAdmin } from "@/app/admin/login/actions";
import {
  NAV_ITEMS,
  breadcrumbs,
  initialsFromEmail,
  sidebarWidthClass,
} from "@/components/admin/admin-nav";

const ACTIVE_CYCLE = {
  title: "Weekly Pulse",
  status: "Live",
  remaining: "3d left",
  href: "/admin/s/weekly-pulse",
};

const QUICK_CREATE = [
  { href: "/admin", label: "Survey", hint: "Start a new pulse" },
  { href: "/admin/action-plans", label: "Action plan", hint: "Assign a follow-up" },
  { href: "/admin/employees", label: "Import employees", hint: "Upload a CSV" },
  { href: "/admin/users", label: "Invite admin", hint: "Grant workspace access" },
] as const;

const NOTIFICATIONS = [
  {
    href: "/admin/s/weekly-pulse",
    title: "Weekly Pulse is live",
    body: "42% of the roster has responded.",
    time: "2h",
  },
  {
    href: "/admin/feedbacks",
    title: "New written comments",
    body: "Engineering left 6 comments this cycle.",
    time: "Yesterday",
  },
  {
    href: "/admin/employees",
    title: "Import finished",
    body: "128 employees upserted from CSV.",
    time: "Mon",
  },
] as const;

const SEARCH_EXTRAS = [
  { href: "/admin/s/weekly-pulse", label: "Weekly Pulse", hint: "Open survey" },
  { href: "/admin/employees", label: "Import employees", hint: "People" },
] as const;

type AdminTopbarProps = {
  email: string;
  collapsed: boolean;
  onOpenMobile: () => void;
};

export function AdminTopbar({
  email,
  collapsed,
  onOpenMobile,
}: AdminTopbarProps) {
  const pathname = usePathname();
  const crumbs = breadcrumbs(pathname);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 border-b border-ink/10 bg-paper/90 backdrop-blur">
      <div
        className={`hidden shrink-0 items-center border-r border-ink/10 md:flex ${sidebarWidthClass(collapsed)} ${
          collapsed ? "justify-center px-2" : "px-4"
        }`}
      >
        <Link
          href="/admin"
          className="flex items-center gap-2 text-ink"
          title="Cadence"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-serif text-lg leading-none text-paper">
            C
          </span>
          {collapsed ? (
            <span className="sr-only">Cadence</span>
          ) : (
            <span className="font-serif text-lg">Cadence</span>
          )}
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 md:gap-3 md:px-8">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink/10 text-ink transition-colors hover:bg-ink/5 md:hidden"
          aria-label="Open sidebar"
          onClick={onOpenMobile}
        >
          <MenuIcon />
        </button>

        <Link
          href="/admin"
          className="flex shrink-0 items-center gap-2 text-ink md:hidden"
          title="Cadence"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-serif text-lg leading-none text-paper">
            C
          </span>
        </Link>

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 ? (
                    <span className="text-ink/30" aria-hidden>
                      /
                    </span>
                  ) : null}
                  {last || !crumb.href ? (
                    <span
                      className={`truncate font-medium ${last ? "text-ink" : "text-ink/50"}`}
                      aria-current={last ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hidden truncate text-ink/50 hover:text-ink sm:inline"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

      <button
        ref={searchButtonRef}
        type="button"
        onClick={() => setSearchOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink/10 bg-white/60 px-2.5 text-sm text-ink/50 transition-colors hover:border-ink/25 hover:text-ink"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <SearchIcon />
        <span className="hidden md:inline">Search</span>
        <kbd className="ml-4 hidden rounded border border-ink/10 bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink/45 lg:inline">
          ⌘K
        </kbd>
      </button>

      <Link
        href={ACTIVE_CYCLE.href}
        title={`${ACTIVE_CYCLE.title} · ${ACTIVE_CYCLE.status} · ${ACTIVE_CYCLE.remaining}`}
        className="hidden items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-1.5 text-xs text-ink/70 transition-colors hover:border-ink/25 lg:inline-flex"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        <span className="font-medium text-ink">{ACTIVE_CYCLE.title}</span>
        <span className="text-ink/40">{ACTIVE_CYCLE.remaining}</span>
      </Link>

        <QuickCreateMenu />
        <NotificationsMenu />
        <HelpMenu />
        <ProfileMenu email={email} />
      </div>

      {searchOpen ? (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          returnFocusRef={searchButtonRef}
        />
      ) : null}
    </header>
  );
}

function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(open, () => setOpen(false), rootRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-ink px-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="New"
        onClick={() => setOpen((current) => !current)}
      >
        <PlusIcon />
        <span className="hidden sm:inline">New</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-lg"
        >
          <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-[0.16em] text-ink/40 uppercase">
            Create
          </p>
          {QUICK_CREATE.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              className="block px-4 py-2.5 hover:bg-ink/5"
              onClick={() => setOpen(false)}
            >
              <p className="text-sm text-ink">{item.label}</p>
              <p className="text-xs text-ink/45">{item.hint}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(open, () => setOpen(false), rootRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-ink transition-colors hover:bg-ink/5"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <p className="text-sm font-medium text-ink">Notifications</p>
            <span className="text-xs text-ink/40">3 new</span>
          </div>
          {NOTIFICATIONS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              role="menuitem"
              className="block border-b border-ink/5 px-4 py-3 last:border-0 hover:bg-ink/5"
              onClick={() => setOpen(false)}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-ink">{item.title}</p>
                <p className="shrink-0 text-xs text-ink/40">{item.time}</p>
              </div>
              <p className="mt-0.5 text-xs text-ink/50">{item.body}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HelpMenu() {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useDismiss(open, () => setOpen(false), rootRef);

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          ref={helpButtonRef}
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-ink transition-colors hover:bg-ink/5"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="Help"
          onClick={() => setOpen((current) => !current)}
        >
          <HelpIcon />
        </button>
        {open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-2.5 text-left text-sm text-ink/80 hover:bg-ink/5"
              onClick={() => {
                setOpen(false);
                setShortcuts(true);
              }}
            >
              Keyboard shortcuts
            </button>
            <Link
              href="/admin/settings"
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-ink/80 hover:bg-ink/5"
              onClick={() => setOpen(false)}
            >
              Help center
            </Link>
            <a
              href="mailto:admin@cadence.local"
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-ink/80 hover:bg-ink/5"
              onClick={() => setOpen(false)}
            >
              Contact support
            </a>
          </div>
        ) : null}
      </div>
      {shortcuts ? (
        <ShortcutsDialog
          onClose={() => setShortcuts(false)}
          returnFocusRef={helpButtonRef}
        />
      ) : null}
    </>
  );
}

function ProfileMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const initials = initialsFromEmail(email);
  useDismiss(open, () => setOpen(false), rootRef);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white/70 text-[11px] font-medium tracking-wide text-ink transition-colors hover:border-ink/40"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="sr-only">Open profile menu</span>
        {initials}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-lg"
        >
          <div className="border-b border-ink/10 px-4 py-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-ink/40 uppercase">
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

function SearchPalette({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_ITEMS.map((item) => ({
      href: item.href,
      label: item.label,
      hint: item.section,
    }));
    const extras = SEARCH_EXTRAS.map((item) => ({
      href: item.href,
      label: item.label,
      hint: item.hint,
    }));
    const all = [...pages, ...extras];
    if (!q) {
      return all.slice(0, 8);
    }
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const returnTo = returnFocusRef.current;
    inputRef.current?.focus();
    return () => {
      (returnTo ?? previous)?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        trapTab(event, dialogRef.current);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => Math.max(current - 1, 0));
      }
      if (event.key === "Enter" && results[active]) {
        event.preventDefault();
        router.push(results[active].href);
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onClose, results, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[15vh]">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Search"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-ink/10 px-4">
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search pages, surveys, people…"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
          />
          <kbd className="rounded border border-ink/10 px-1.5 py-0.5 font-mono text-[10px] text-ink/40">
            Esc
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink/50">No matches.</li>
          ) : (
            results.map((item, index) => (
              <li key={`${item.href}-${item.label}`}>
                <Link
                  href={item.href}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    index === active ? "bg-accent/10 text-ink" : "text-ink/80 hover:bg-ink/5"
                  }`}
                  onMouseEnter={() => setActive(index)}
                  onClick={onClose}
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-ink/40">{item.hint}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

function ShortcutsDialog({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const returnTo = returnFocusRef.current;
    closeRef.current?.focus();
    return () => {
      (returnTo ?? previous)?.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        trapTab(event, dialogRef.current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4">
      <button
        type="button"
        aria-label="Close shortcuts"
        tabIndex={-1}
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-ink/10 bg-paper p-5 shadow-xl"
      >
        <p className="font-serif text-2xl text-ink">Shortcuts</p>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-ink/70">
          <li className="flex items-center justify-between">
            <span>Search</span>
            <kbd className="rounded border border-ink/10 px-1.5 py-0.5 font-mono text-[11px]">
              ⌘K
            </kbd>
          </li>
          <li className="flex items-center justify-between">
            <span>Close dialog</span>
            <kbd className="rounded border border-ink/10 px-1.5 py-0.5 font-mono text-[11px]">
              Esc
            </kbd>
          </li>
        </ul>
        <button
          ref={closeRef}
          type="button"
          className="mt-5 rounded-lg border border-ink/10 px-3 py-1.5 text-sm text-ink/80 hover:bg-ink/5"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

function focusableElements(root: HTMLElement) {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.tabIndex !== -1);
}

function trapTab(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) {
    return;
  }
  const list = focusableElements(root);
  if (list.length === 0) {
    event.preventDefault();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function useDismiss(
  open: boolean,
  onClose: () => void,
  rootRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, rootRef]);
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6.5a4 4 0 1 1 8 0c0 2.2.7 3.2 1.2 3.8H2.8C3.3 9.7 4 8.7 4 6.5ZM6.5 13h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.6 6.4a1.4 1.4 0 1 1 2.2 1.15c-.5.32-.8.62-.8 1.2V9.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M8 11.3h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
