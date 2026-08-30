import Link from "next/link";

export default function AdminSurveyNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Admin</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Survey not found</h1>
      <Link
        href="/admin"
        className="mt-8 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to surveys
      </Link>
    </main>
  );
}
