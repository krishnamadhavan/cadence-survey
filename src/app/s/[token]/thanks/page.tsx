import Link from "next/link";
import { getSurveyByToken } from "@/db/queries";

export const dynamic = "force-dynamic";

type ThanksPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ThanksPage({ params }: ThanksPageProps) {
  const { token } = await params;
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
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Thank you.</h1>
      <p className="mt-4 text-base leading-7 text-ink/70">
        Your response to {title} is saved. That is all we needed.
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
