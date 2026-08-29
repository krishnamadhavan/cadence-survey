import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSurveyByToken } from "@/db/queries";
import { SurveyForm } from "./survey-form";

export const dynamic = "force-dynamic";

type SurveyPageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({ params }: SurveyPageProps) {
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

export default async function SurveyPage({ params }: SurveyPageProps) {
  const { token } = await params;

  let survey;
  try {
    survey = await getSurveyByToken(token);
  } catch {
    return (
      <Shell>
        <p className="text-ink/70">
          Could not reach Postgres. Start the stack with{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">
            make setup
          </code>{" "}
          and refresh.
        </p>
      </Shell>
    );
  }

  if (!survey) {
    notFound();
  }

  const jar = await cookies();
  const alreadySubmitted = jar.get(`cadence_submitted_${token}`)?.value === "1";

  if (survey.status !== "open") {
    return (
      <Shell>
        <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">{survey.title}</h1>
        <p className="mt-4 text-ink/70">This pulse is closed.</p>
      </Shell>
    );
  }

  if (alreadySubmitted) {
    return (
      <Shell>
        <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">{survey.title}</h1>
        <p className="mt-4 text-ink/70">You already sent a response. Thank you.</p>
        <Link
          href={`/s/${token}/thanks`}
          className="mt-6 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          View confirmation
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm tracking-wide text-accent uppercase">Pulse survey</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">{survey.title}</h1>
      {survey.description ? (
        <p className="mt-3 max-w-xl text-base leading-7 text-ink/70">
          {survey.description}
        </p>
      ) : null}
      <div className="mt-10">
        <SurveyForm token={survey.publicToken} questions={survey.questions} />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
      {children}
    </main>
  );
}
