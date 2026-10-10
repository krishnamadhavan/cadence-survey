import { notFound } from "next/navigation";
import { WorkspaceLogo } from "@/components/workspace-logo";
import { readPulseLink } from "@/db/pulse-links";
import { getSurveyByToken, listEmployeeRolesByTeam } from "@/db/queries";
import { SurveyForm } from "../survey-form";

export const dynamic = "force-dynamic";

type PersonalSurveyPageProps = {
  params: Promise<{ token: string; code: string }>;
};

export async function generateMetadata({ params }: PersonalSurveyPageProps) {
  const { token } = await params;
  try {
    const survey = await getSurveyByToken(token);
    if (!survey) {
      return { title: "Survey not found · Cadence" };
    }
    return { title: `${survey.title} · Cadence` };
  } catch {
    return { title: "Cadence" };
  }
}

export default async function PersonalSurveyPage({ params }: PersonalSurveyPageProps) {
  const { token, code } = await params;

  let survey;
  try {
    survey = await getSurveyByToken(token);
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
        <WorkspaceLogo />
        <p className="text-ink/70">Could not reach Postgres.</p>
      </main>
    );
  }

  if (!survey) {
    notFound();
  }

  let link;
  try {
    link = await readPulseLink(token, code);
  } catch {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
        <WorkspaceLogo />
        <p className="text-ink/70">Could not reach Postgres.</p>
      </main>
    );
  }

  if (!link) {
    notFound();
  }

  if (link.status !== "open") {
    return (
      <Shell title={link.title}>
        <p className="mt-4 text-ink/70">
          {link.status === "draft" ? "This pulse is not open yet." : "This pulse is closed."}
        </p>
      </Shell>
    );
  }

  if (!link.editable) {
    return (
      <Shell title={link.title}>
        <p className="mt-4 text-ink/70">You already sent a response. Thank you.</p>
      </Shell>
    );
  }

  if (survey.status !== "open") {
    notFound();
  }

  const rolesByTeam = await listEmployeeRolesByTeam();
  const teamRoles = rolesByTeam.find((entry) => entry.teamId === link.teamId)?.roles ?? [];
  const roles =
    link.role && !teamRoles.includes(link.role) ? [...teamRoles, link.role] : teamRoles;
  const initialValues = Object.fromEntries(
    link.answers.map((answer) => [answer.questionId, answer.value]),
  );

  return (
    <Shell title={survey.title} eyebrow="Pulse survey">
      {survey.description ? (
        <p className="mt-3 max-w-xl text-base leading-7 text-ink/70">{survey.description}</p>
      ) : null}
      {link.redeemed ? (
        <p className="mt-3 max-w-xl text-base leading-7 text-ink/70">
          You can change your answers until this pulse closes.
        </p>
      ) : null}
      <div className="mt-10">
        <SurveyForm
          token={survey.publicToken}
          code={code}
          questions={survey.questions}
          roles={roles}
          initialValues={initialValues}
          initialRole={link.role ?? ""}
          editing={link.redeemed}
        />
      </div>
    </Shell>
  );
}

function Shell({
  title,
  eyebrow = "Cadence",
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
      <WorkspaceLogo />
      <p className="text-sm tracking-wide text-accent uppercase">{eyebrow}</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">{title}</h1>
      {children}
    </main>
  );
}
