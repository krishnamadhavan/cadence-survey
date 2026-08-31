import Link from "next/link";

export default function AdminSurveyNotFound() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="font-serif text-4xl text-ink">Survey not found</h1>
      <Link
        href="/admin"
        className="mt-6 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to surveys
      </Link>
    </div>
  );
}
