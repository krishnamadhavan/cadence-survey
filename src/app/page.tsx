import Link from "next/link";
import { getOpenSurveys } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  let surveys: Awaited<ReturnType<typeof getOpenSurveys>> = [];
  let dbError = false;

  try {
    surveys = await getOpenSurveys();
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-4 font-serif text-5xl leading-tight text-ink">
        Pulse surveys, one public link.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-ink/70">
        People open a link, answer a short check-in, and the response lands in
        Postgres. Redis rate-limits the public submit path. No local database
        install — both stores run in Docker.
      </p>

      {dbError ? (
        <div className="mt-10 rounded-2xl border border-ink/10 bg-white/60 px-5 py-4 text-sm leading-6 text-ink/80">
          Postgres is not reachable. From the repo root:
          <pre className="mt-3 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-xs text-paper">
            make setup{"\n"}make dev
          </pre>
        </div>
      ) : (
        <section className="mt-12">
          <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
            Open surveys
          </h2>
          {surveys.length === 0 ? (
            <p className="mt-3 text-ink/70">
              No open surveys yet. Run{" "}
              <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">
                pnpm db:seed
              </code>{" "}
              to load the weekly pulse.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {surveys.map((survey) => (
                <li key={survey.id}>
                  <Link
                    href={`/s/${survey.publicToken}`}
                    className="block rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 transition-colors hover:border-accent/40"
                  >
                    <p className="font-medium text-ink">{survey.title}</p>
                    {survey.description ? (
                      <p className="mt-1 text-sm leading-6 text-ink/60">
                        {survey.description}
                      </p>
                    ) : null}
                    <p className="mt-2 font-mono text-xs text-accent">
                      /s/{survey.publicToken}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-12 text-sm text-ink/45">
        <Link href="/admin" className="underline-offset-4 hover:text-ink hover:underline">
          Admin results
        </Link>
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm text-ink/60 sm:grid-cols-4">
        <div>
          <dt className="text-ink/40">App</dt>
          <dd className="mt-1 text-ink">Next.js + TS</dd>
        </div>
        <div>
          <dt className="text-ink/40">Database</dt>
          <dd className="mt-1 text-ink">Postgres 16</dd>
        </div>
        <div>
          <dt className="text-ink/40">Cache</dt>
          <dd className="mt-1 text-ink">Redis 7</dd>
        </div>
        <div>
          <dt className="text-ink/40">ORM</dt>
          <dd className="mt-1 text-ink">Drizzle</dd>
        </div>
      </dl>
    </main>
  );
}
