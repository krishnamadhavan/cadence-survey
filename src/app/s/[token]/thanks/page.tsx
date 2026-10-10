import Link from "next/link";
import { WorkspaceLogo } from "@/components/workspace-logo";
import { getSurveyByToken } from "@/db/queries";

export const dynamic = "force-dynamic";

type ThanksPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function ThanksPage({ params, searchParams }: ThanksPageProps) {
  const { token } = await params;
  const code = personalCode((await searchParams).code);
  let title = "Pulse received";

  try {
    const survey = await getSurveyByToken(token);
    if (survey) {
      title = survey.title;
    }
  } catch {
    // page still works if the database is down after submit
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-16">
      <WorkspaceLogo />
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Thank you.</h1>
      <p className="mt-4 text-base leading-7 text-ink/70">
        Your response to {title} is saved. You can change it from the same link
        until this pulse closes.
      </p>
      {code ? (
        <Link
          href={`/s/${token}/${code}`}
          className="mt-8 inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Change your answers
        </Link>
      ) : null}
      <Link
        href="/"
        className={`${code ? "mt-4" : "mt-8"} inline-flex text-sm font-medium text-accent underline-offset-4 hover:underline`}
      >
        Back to Cadence
      </Link>
    </main>
  );
}

function personalCode(value: string | string[] | undefined): string | null {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code || !/^[0-9a-f]{32}$/.test(code)) {
    return null;
  }
  return code;
}
