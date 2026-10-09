type ExportButtonsProps = {
  token: string;
  role?: string | null;
};

export function ExportButtons({ token, role }: ExportButtonsProps) {
  const base = `/api/admin/surveys/${token}/export`;
  const roleQuery = role ? `&role=${encodeURIComponent(role)}` : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`${base}?format=csv${roleQuery}`}
        className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 bg-white/70 px-4 text-sm font-medium text-ink transition-colors hover:border-ink/40"
      >
        Download CSV
      </a>
      <a
        href={`${base}?format=xlsx${roleQuery}`}
        className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink/90"
      >
        Download Excel
      </a>
    </div>
  );
}

export function ResponseExportLink({ token }: { token: string }) {
  return (
    <a
      href={`/api/admin/surveys/${token}/responses`}
      className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 bg-white/70 px-4 text-sm font-medium text-ink transition-colors hover:border-ink/40"
    >
      Download responses
    </a>
  );
}
