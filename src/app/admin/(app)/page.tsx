import Link from "next/link";
import { listSurveysForAdmin } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  let surveys: Awaited<ReturnType<typeof listSurveysForAdmin>> = [];
  let dbError = false;

  try {
    surveys = await listSurveysForAdmin();
  } catch {
    dbError = true;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="font-serif text-4xl text-ink">Surveys</h1>
      <p className="mt-2 text-ink/60">
        Open a pulse to see results, or share the public link.
      </p>

      {dbError ? (
        <p className="mt-10 text-ink/70">Could not reach Postgres.</p>
      ) : surveys.length === 0 ? (
        <p className="mt-10 text-ink/70">No surveys yet. Run the seed.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {surveys.map((survey) => (
            <li key={survey.id}>
              <Link
                href={`/admin/s/${survey.publicToken}`}
                className="block rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 transition-colors hover:border-accent/40"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium text-ink">{survey.title}</p>
                  <p className="text-sm text-ink/50">
                    {survey.responseCount}{" "}
                    {survey.responseCount === 1 ? "response" : "responses"}
                  </p>
                </div>
                <p className="mt-1 font-mono text-xs text-accent">
                  /s/{survey.publicToken}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
