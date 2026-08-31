import { listEmployees } from "@/db/employees";
import { listTeams } from "@/db/queries";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  let people: Awaited<ReturnType<typeof listEmployees>> = [];
  let teams: Awaited<ReturnType<typeof listTeams>> = [];
  let dbError = false;

  try {
    people = await listEmployees();
    teams = await listTeams();
  } catch {
    dbError = true;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="font-serif text-4xl text-ink">Employees</h1>
      <p className="mt-2 text-ink/60">
        Load the roster from a CSV. Existing emails are updated.
      </p>

      <section className="mt-8 rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Bulk upload
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          CSV columns: <code className="font-mono text-xs">name</code>,{" "}
          <code className="font-mono text-xs">email</code>,{" "}
          <code className="font-mono text-xs">team</code>. Team must match one
          of:{" "}
          {teams.length > 0
            ? teams.map((team) => team.name).join(", ")
            : "seed teams first"}
          .
        </p>
        {dbError ? (
          <p className="mt-4 text-sm text-ink/70">
            Could not reach Postgres. The upload form is disabled until the
            database is up.
          </p>
        ) : (
          <>
            <a
              href="/api/admin/employees/template"
              className="mt-3 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              Download template
            </a>
            <div className="mt-5">
              <UploadForm />
            </div>
          </>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Roster
        </h2>
        {dbError ? (
          <p className="mt-4 text-ink/70">Could not reach Postgres.</p>
        ) : people.length === 0 ? (
          <p className="mt-4 text-ink/70">No employees yet. Upload a CSV.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Team</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className="border-t border-ink/5">
                    <td className="px-4 py-3 font-medium text-ink">
                      {person.name}
                    </td>
                    <td className="px-4 py-3 text-ink/70">{person.email}</td>
                    <td className="px-4 py-3 text-ink/70">{person.teamName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
