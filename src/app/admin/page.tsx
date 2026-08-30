import Link from "next/link";
import { redirect } from "next/navigation";
import { listSurveysForAdmin } from "@/db/queries";
import { hasAdminSession } from "@/lib/admin";
import { logoutAdmin } from "./login/actions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?next=/admin");
  }

  let surveys: Awaited<ReturnType<typeof listSurveysForAdmin>> = [];
  let dbError = false;

  try {
    surveys = await listSurveysForAdmin();
  } catch {
    dbError = true;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm tracking-wide text-accent uppercase">Admin</p>
          <h1 className="mt-2 font-serif text-4xl text-ink">Survey results</h1>
        </div>
        <form action={logoutAdmin}>
          <button
            type="submit"
            className="text-sm text-ink/50 underline-offset-4 hover:text-ink hover:underline"
          >
            Log out
          </button>
        </form>
      </header>

      {dbError ? (
        <p className="mt-10 text-ink/70">Could not reach Postgres.</p>
      ) : surveys.length === 0 ? (
        <p className="mt-10 text-ink/70">No surveys yet. Run the seed.</p>
      ) : (
        <ul className="mt-10 flex flex-col gap-3">
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
                  /admin/s/{survey.publicToken}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
