import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExportButtons,
  ResponseExportLink,
} from "@/app/admin/(app)/s/[token]/export-buttons";
import { ResponseImportForm } from "@/app/admin/(app)/s/[token]/response-import-form";
import { ResultShare } from "@/app/admin/(app)/s/[token]/result-share";
import { ReportFilters } from "@/app/admin/(app)/reports/[token]/report-filters";
import { getResultShareToken } from "@/db/result-shares";
import { getSurveyReportDetail } from "@/db/reports";
import { getAnonymityFloor } from "@/db/settings";
import {
  SUPPRESSED_TEAM_NAME,
  type QuestionResults,
  type TeamHealth,
  type TeamSummary,
} from "@/db/results";
import { getAdminSessionUser } from "@/lib/admin";
import { tenureBandLabel, type TenureBand } from "@/lib/employee-attributes";

export const dynamic = "force-dynamic";

type ReportDetailPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    team?: string | string[];
    role?: string | string[];
    tenure?: string | string[];
  }>;
};

export async function generateMetadata({ params }: ReportDetailPageProps) {
  const { token } = await params;
  return { title: `Report · ${token} · Cadence` };
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: ReportDetailPageProps) {
  const admin = await getAdminSessionUser();
  const canWrite = admin?.role === "admin";
  const { token } = await params;
  const query = await searchParams;
  const teamRaw = firstParam(query.team) ?? "";
  const roleRaw = firstParam(query.role) ?? "";
  const tenureRaw = firstParam(query.tenure) ?? "";
  let detail: Awaited<ReturnType<typeof getSurveyReportDetail>> | null = null;
  let shareToken: string | null = null;
  let dbError = false;

  try {
    detail = await getSurveyReportDetail(token, {
      teamId: teamRaw,
      role: roleRaw,
      tenure: tenureRaw,
    });
    if (detail?.results.survey.status === "closed") {
      shareToken = await getResultShareToken(detail.selected.publicToken);
    }
  } catch {
    dbError = true;
  }

  if (dbError) {
    return <p className="text-ink/70">Could not reach Postgres.</p>;
  }
  if (!detail) {
    notFound();
  }

  const { selected, previous, results, previousResults, employeeCount } =
    detail;
  const roleOnly = Boolean(
    detail.role && !detail.teamId && !detail.tenure && !teamRaw && !tenureRaw,
  );
  const tenureOnly = Boolean(detail.tenure && !detail.role && !detail.teamId && !teamRaw);
  const label = segmentLabel(detail, teamRaw, tenureRaw);
  const anonymityFloor = await getAnonymityFloor();
  const publishable =
    results.roleVisibility === "all" || results.roleVisibility === "shown";
  const previousPublished =
    previousResults &&
    (previousResults.roleVisibility === "all" ||
      previousResults.roleVisibility === "shown")
      ? previousResults
      : null;
  const participation =
    publishable && employeeCount > 0
      ? Math.min(
          100,
          Math.round((results.survey.responseCount / employeeCount) * 100),
        )
      : null;
  const previousParticipation =
    previousPublished && employeeCount > 0
      ? Math.min(
          100,
          Math.round(
            (previousPublished.survey.responseCount / employeeCount) * 100,
          ),
        )
      : null;
  const watching = results.teams.filter(
    (team) =>
      team.health !== "ok" &&
      team.responseCount > 0 &&
      team.teamName !== SUPPRESSED_TEAM_NAME,
  );
  const namedTeams = results.teams.filter(
    (team) => team.teamName !== SUPPRESSED_TEAM_NAME,
  );
  const scaleQuestions = results.questions.filter(
    (question) => question.scale,
  );
  const lowQuestions = scaleQuestions.filter((question) => {
    const average = question.scale?.average;
    return average !== null && average !== undefined && average < 3.5;
  });
  const commentCount = results.questions.reduce(
    (sum, question) => sum + (question.text?.count ?? 0),
    0,
  );
  const cycles = detail.cycles;
  const hasCycles = cycles.length >= 2;

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin/reports"
            className="text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            All reports
          </Link>
          <h1 className="mt-3 font-serif text-4xl text-ink">
            {results.survey.title}
          </h1>
          <p className="mt-2 text-sm text-ink/50">
            <StatusPill status={results.survey.status} />
            <span className="ml-2">
              Created {formatDate(selected.createdAt)}
            </span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {publishable ? (
            <>
              <ExportButtons
                token={selected.publicToken}
                role={detail.role}
                teamId={detail.teamId}
                tenure={detail.tenure}
              />
              <p className="text-xs text-ink/45 sm:text-right">
                Written comments are only in the file, and only for teams that
                meet the anonymity floor.
              </p>
            </>
          ) : null}
          {results.survey.status === "closed" ? (
            <>
              <ResponseExportLink token={selected.publicToken} />
              <p className="max-w-xs text-xs text-ink/45 sm:text-right">
                One row per response, with the team, role, and tenure. A team
                is included only when the report can name it. Smaller groups
                are left out. This file is the whole pulse, not the filters
                on this page.
              </p>
            </>
          ) : null}
        </div>
      </header>

      {canWrite && results.survey.status === "closed" ? (
        <ResultShare
          token={selected.publicToken}
          sharePath={shareToken ? `/results/${shareToken}` : null}
          note="The link opens the full report, not the filters on this page."
        />
      ) : null}

      {canWrite ? (
        <ResponseImportForm
          token={selected.publicToken}
          status={results.survey.status}
          questionCount={results.questions.length}
        />
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Filters / segments
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <ReportFilters
            token={selected.publicToken}
            teams={detail.teams}
            roles={detail.roles}
            teamId={detail.teamId ?? teamRaw}
            role={detail.role ?? ""}
            tenure={detail.tenure ?? tenureRaw}
          />
          <p className="text-xs text-ink/45">
            {label
              ? roleOnly
                ? `${detail.role} across teams. Groups under ${anonymityFloor} responses stay hidden. A role that would leave a smaller group exposed stays in All roles.`
                : `Groups under ${anonymityFloor} responses stay hidden. A slice that would leave a smaller group exposed stays in the wider report.${
                    detail.tenure
                      ? " Tenure is the roster band from when the person submitted. Older answers with no band stay under All tenure."
                      : ""
                  }`
              : `Combine team, role, and tenure. Groups under ${anonymityFloor} responses stay hidden.`}
          </p>
        </div>
      </section>

      {publishable ? (
      <>
      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Responses"
          value={String(results.survey.responseCount)}
          hint={
            participation === null
              ? label
                ? `Submitted answers in ${label}`
                : "Submitted answers"
              : label
                ? `${participation}% of people in ${label}`
                : `${participation}% of the roster`
          }
        />
        <Stat
          label="Average score"
          value={formatScore(results.survey.averageScore)}
          hint={label ? `Scale questions for ${label}` : "Scale questions only"}
        />
        <Stat
          label="Participation"
          value={participation === null ? "—" : `${participation}%`}
          hint={
            label
              ? `${results.survey.responseCount} of ${employeeCount || "—"} people in ${label}`
              : `${results.survey.responseCount} of ${employeeCount || "—"} people`
          }
        />
        <Stat
          label="Teams to watch"
          value={String(watching.length)}
          hint={
            watching.length > 0
              ? watching.map((team) => team.teamName).join(", ")
              : "None right now"
          }
        />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Needs attention
        </h2>
        {watching.length === 0 && lowQuestions.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            No named teams or scale questions sit below the watch line.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {watching.map((team) => (
              <li
                key={team.teamId ?? team.teamName}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm"
              >
                <span className="font-medium text-ink">{team.teamName}</span>
                <span className="flex items-center gap-2 text-ink/60">
                  {formatScore(team.averageScore)}
                  <HealthBadge team={team} />
                </span>
              </li>
            ))}
            {lowQuestions.map((question) => (
              <li
                key={question.id}
                className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-ink">
                  Q{question.position}. {question.prompt}
                </span>
                <span className="ml-3 shrink-0 text-ink/60">
                  {formatScore(question.scale?.average ?? null)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Compare vs last cycle
        </h2>
        {selected.status === "draft" ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Drafts are not cycles. Open or close a pulse to compare it.
          </p>
        ) : !hasCycles ? (
          <NeedsCycles />
        ) : !previous || !previousResults ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            No earlier cycle to compare. This is the first published pulse.
          </p>
        ) : !previousPublished ? (
          <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            {previousResults.roleVisibility === "empty"
              ? roleOnly
                ? `No ${detail.role ?? "role"} responses in ${previous.title}.`
                : `No ${label ?? "slice"} responses in ${previous.title}.`
              : previousResults.roleVisibility === "withheld"
                ? roleOnly
                  ? `${detail.role ?? "That role"} stays in the full report for ${previous.title}, so a smaller group is not broken out.`
                  : `${label ?? "That slice"} stays in the wider report for ${previous.title}, so a smaller group is not broken out.`
                : roleOnly
                  ? `${previous.title} does not have enough responses${detail.role ? ` in ${detail.role}` : ""} to compare.`
                  : `${previous.title} does not have enough responses${label ? ` in ${label}` : ""} to compare.`}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <CompareCard
              label="Average score"
              current={formatScore(results.survey.averageScore)}
              previous={formatScore(previousPublished.survey.averageScore)}
              delta={delta(
                results.survey.averageScore,
                previousPublished.survey.averageScore,
              )}
              vs={previous.title}
            />
            <CompareCard
              label="Responses"
              current={String(results.survey.responseCount)}
              previous={String(previousPublished.survey.responseCount)}
              delta={
                results.survey.responseCount -
                previousPublished.survey.responseCount
              }
              vs={previous.title}
            />
            <CompareCard
              label="Participation"
              current={
                participation === null ? "—" : `${participation}%`
              }
              previous={
                previousParticipation === null
                  ? "—"
                  : `${previousParticipation}%`
              }
              delta={
                participation !== null && previousParticipation !== null
                  ? participation - previousParticipation
                  : null
              }
              vs={previous.title}
            />
          </div>
        )}
      </section>
      </>
      ) : (
        <SegmentNotice
          kind={
            results.roleVisibility === "hidden"
              ? "hidden"
              : results.roleVisibility === "withheld"
                ? "withheld"
                : "empty"
          }
          label={roleOnly ? (detail.role ?? "This role") : (label ?? "This slice")}
          roleOnly={roleOnly}
          tenureOnly={tenureOnly}
          floor={anonymityFloor}
        />
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Trend over time
        </h2>
        {label ? (
          <p className="mt-1 text-sm text-ink/55">
            {label} only. A cycle that is too small, or that would single out a smaller group, is left blank.
          </p>
        ) : null}
        {!hasCycles ? (
          <NeedsCycles />
        ) : (
          <TrendList
            items={cycles.map((survey) => ({
              id: survey.id,
              title: survey.title,
              value: survey.averageScore,
              display: formatScore(survey.averageScore),
            }))}
          />
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Participation over time
        </h2>
        {label ? (
          <p className="mt-1 text-sm text-ink/55">
            {roleOnly
              ? `${detail.role} responses compared with people who have that role now.`
              : `${label} responses compared with people who match this slice now.`}
          </p>
        ) : null}
        {!hasCycles ? (
          <NeedsCycles />
        ) : (
          <TrendList
            items={cycles.map((survey) => ({
              id: survey.id,
              title: survey.title,
              value: survey.participation,
              display:
                survey.participation === null
                  ? "—"
                  : `${survey.participation}%`,
            }))}
          />
        )}
      </section>

      {publishable ? (
      <>
      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Score by question
        </h2>
        <div className="mt-4 flex flex-col gap-6">
          {results.questions.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Heatmap
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          {label ? (detail.teamId ? `${label}. ` : `${label} on each team. `) : ""}
          Team × scale question. Colour follows the same low / watch / ok
          bands. Small teams stay hidden.
        </p>
        {namedTeams.length === 0 || scaleQuestions.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Not enough published team scores to draw a heatmap.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  {scaleQuestions.map((question) => (
                    <th key={question.id} className="px-3 py-3 font-medium">
                      Q{question.position}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {namedTeams.map((team) => (
                  <tr
                    key={team.teamId ?? team.teamName}
                    className="border-t border-ink/5"
                  >
                    <td className="px-4 py-2 font-medium text-ink">
                      {team.teamName}
                    </td>
                    {scaleQuestions.map((question) => {
                      const cell = question.scale?.byTeam.find(
                        (row) =>
                          (row.teamId ?? row.teamName) ===
                          (team.teamId ?? team.teamName),
                      );
                      return (
                        <td key={question.id} className="px-2 py-2">
                          <HeatCell value={cell?.average ?? null} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          By team
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          Sorted worst first. Teams with fewer than {anonymityFloor}{" "}
          responses{label ? ` in ${label}` : ""} are hidden so one
          person cannot be identified.
        </p>
        {namedTeams.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
            Not enough responses per team to show a breakdown.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/70">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-ink/10 text-ink/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 font-medium">Responses</th>
                  <th className="px-4 py-3 font-medium">Avg score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {namedTeams.map((team) => (
                  <tr
                    key={team.teamId ?? team.teamName}
                    className="border-t border-ink/5"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      {team.teamName}
                    </td>
                    <td className="px-4 py-3 text-ink/70">
                      {team.responseCount}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {formatScore(team.averageScore)}
                    </td>
                    <td className="px-4 py-3">
                      <HealthBadge team={team} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
        <h2 className="text-sm font-medium tracking-wide text-ink/50 uppercase">
          Comments
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          {commentCount} written{" "}
          {commentCount === 1 ? "answer" : "answers"}
          {label ? ` in ${label}` : ""} on this pulse. The words
          themselves stay in the CSV/Excel download, and only for named teams
          that meet the floor.
        </p>
      </section>
      </>
      ) : null}
    </div>
  );
}

function SegmentNotice({
  kind,
  label,
  roleOnly,
  tenureOnly,
  floor,
}: {
  kind: "empty" | "hidden" | "withheld";
  label: string;
  roleOnly: boolean;
  tenureOnly: boolean;
  floor: number;
}) {
  const message = roleOnly
    ? kind === "empty"
      ? `No responses for ${label} yet. Responses with no role stay under All roles.`
      : kind === "withheld"
        ? `${label} stays in All roles. Showing it on its own would identify a smaller group, so scores, counts, and comments stay in the full report.`
        : `${label} has too few responses to show. A role needs at least ${floor} responses before scores, counts, or comments are shown.`
    : kind === "empty"
      ? tenureOnly
        ? `No responses for ${label} yet. Responses with no tenure stay under All tenure.`
        : `No responses for ${label} yet.`
      : kind === "withheld"
        ? `${label} stays in the wider report. Showing it on its own would identify a smaller group, so scores, counts, and comments stay in the wider report.`
        : `${label} has too few responses to show. This slice needs at least ${floor} responses before scores, counts, or comments are shown.`;
  return (
    <p className="mt-8 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
      {message}
    </p>
  );
}

function NeedsCycles() {
  return (
    <p className="mt-3 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4 text-sm text-ink/70">
      Needs 2+ cycles. Run another pulse to compare and chart over time.
    </p>
  );
}

function CompareCard({
  label,
  current,
  previous,
  delta,
  vs,
}: {
  label: string;
  current: string;
  previous: string;
  delta: number | null;
  vs: string;
}) {
  const sign =
    delta === null || delta === 0 ? "" : delta > 0 ? "+" : "";
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{current}</p>
      <p className="mt-1 text-xs text-ink/50">
        {delta === null ? "—" : `${sign}${delta}`} vs {previous} ({vs})
      </p>
    </div>
  );
}

function TrendList({
  items,
}: {
  items: { id: string; title: string; value: number | null; display: string }[];
}) {
  const numeric = items
    .map((item) => item.value)
    .filter((value): value is number => value !== null);
  const max = numeric.length > 0 ? Math.max(...numeric, 1) : 1;
  return (
    <ul className="mt-3 flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      {[...items].reverse().map((item) => (
        <li key={item.id}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-ink">{item.title}</span>
            <span className="text-ink/60">{item.display}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${item.value === null ? 0 : Math.max(6, Math.round((item.value / max) * 100))}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function HeatCell({ value }: { value: number | null }) {
  const tone =
    value === null ? "empty" : value < 3 ? "low" : value < 3.5 ? "watch" : "ok";
  const color =
    tone === "empty"
      ? "bg-ink/5 text-ink/30"
      : tone === "low"
        ? "bg-rose-200 text-rose-900"
        : tone === "watch"
          ? "bg-amber-200 text-amber-950"
          : "bg-emerald-200 text-emerald-900";
  return (
    <span
      className={`inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium ${color}`}
    >
      {formatScore(value)}
    </span>
  );
}

function QuestionCard({ question }: { question: QuestionResults }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-5">
      <p className="text-xs text-ink/40">Question {question.position}</p>
      <h3 className="mt-1 text-lg font-medium text-ink">{question.prompt}</h3>
      {question.scale ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-ink/60">
            Average {formatScore(question.scale.average)} of {question.scale.max}{" "}
            · {question.scale.count} answers
          </p>
          <ul className="flex flex-col gap-3">
            {question.scale.byTeam.map((team) => (
              <li key={team.teamId ?? team.teamName}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-ink">{team.teamName}</span>
                  <span className="text-ink/60">
                    {formatScore(team.average)} · {team.count}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className={`h-full rounded-full ${
                      team.average !== null && team.average < 3
                        ? "bg-rose-500"
                        : team.average !== null && team.average < 3.5
                          ? "bg-amber-500"
                          : "bg-accent"
                    }`}
                    style={{
                      width: `${
                        team.average === null
                          ? 0
                          : Math.max(
                              6,
                              Math.round(
                                (team.average / (question.scale?.max ?? 5)) *
                                  100,
                              ),
                            )
                      }%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {question.choice ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.choice.count} answers across{" "}
          {question.choice.options.join(", ")}.
        </p>
      ) : null}
      {question.text ? (
        <p className="mt-3 text-sm text-ink/60">
          {question.text.count} written answers. Text is in the export.
        </p>
      ) : null}
    </article>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 px-5 py-4">
      <p className="text-xs tracking-wide text-ink/45 uppercase">{label}</p>
      <p className="mt-2 font-serif text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/50">{hint}</p> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "open" ? "Live" : status === "closed" ? "Closed" : "Draft";
  return (
    <span className="rounded-full border border-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink/60">
      {label}
    </span>
  );
}

function segmentLabel(
  detail: {
    teamId: string | null;
    teamName: string | null;
    role: string | null;
    tenure: TenureBand | null;
  },
  teamRaw: string,
  tenureRaw: string,
): string | null {
  const parts: string[] = [];
  if (detail.teamId || teamRaw) {
    parts.push(detail.teamName ?? "That team");
  }
  if (detail.role) {
    parts.push(detail.role);
  }
  if (detail.tenure) {
    parts.push(tenureBandLabel(detail.tenure));
  } else if (tenureRaw) {
    parts.push(tenureRaw);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function formatScore(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toFixed(1);
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function delta(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return null;
  }
  return Math.round((current - previous) * 10) / 10;
}

function HealthBadge({ team }: { team: TeamSummary }) {
  if (team.responseCount === 0) {
    return <span className="text-ink/40">No data</span>;
  }
  return (
    <span className={healthClass(team.health)}>{healthLabel(team.health)}</span>
  );
}

function healthLabel(health: TeamHealth): string {
  if (health === "low") {
    return "Low";
  }
  if (health === "watch") {
    return "Watch";
  }
  return "Ok";
}

function healthClass(health: TeamHealth): string {
  if (health === "low") {
    return "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800";
  }
  if (health === "watch") {
    return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900";
  }
  return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800";
}
