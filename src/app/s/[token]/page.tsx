import { notFound } from "next/navigation";
import { getSurveyByToken } from "@/db/queries";

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

  if (survey.status !== "open") {
    return (
      <Shell>
        <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
        <h1 className="mt-3 font-serif text-4xl text-ink">{survey.title}</h1>
        <p className="mt-4 text-ink/70">
          {survey.status === "draft"
            ? "This pulse is not open yet."
            : "This pulse is closed."}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm tracking-wide text-accent uppercase">Pulse survey</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">{survey.title}</h1>
      <p className="mt-4 text-ink/70">
        Each person answers through their own link. This address does not
        accept a response.
      </p>
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
