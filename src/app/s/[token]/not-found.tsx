import Link from "next/link";

export default function SurveyNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Link not found</h1>
      <p className="mt-4 text-ink/70">
        This public survey link is invalid or the survey was removed.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Back to Cadence
      </Link>
    </main>
  );
}
