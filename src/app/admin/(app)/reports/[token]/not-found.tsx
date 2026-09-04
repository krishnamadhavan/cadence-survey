import Link from "next/link";

export default function ReportNotFound() {
  return (
    <div className="w-full">
      <h1 className="font-serif text-4xl text-ink">Report not found</h1>
      <Link
        href="/admin/reports"
        className="mt-6 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to reports
      </Link>
    </div>
  );
}
