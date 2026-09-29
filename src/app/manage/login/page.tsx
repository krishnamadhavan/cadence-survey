import Link from "next/link";
import { redirect } from "next/navigation";
import { hasManagerSession } from "@/lib/manager";
import { safeManagerNext } from "@/lib/manager-path";
import { ManagerLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function ManagerLoginPage({ searchParams }: LoginPageProps) {
  if (await hasManagerSession()) {
    redirect("/manage");
  }

  const { next } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Managers</h1>
      <p className="mt-3 text-ink/70">
        Sign in with the email and portal password set for your manager account.
      </p>
      <div className="mt-8">
        <ManagerLoginForm nextPath={safeManagerNext(next ?? null)} />
      </div>
      <p className="mt-8 text-sm text-ink/45">
        <Link href="/admin/login" className="underline-offset-4 hover:text-ink hover:underline">
          Admin sign-in
        </Link>
      </p>
    </main>
  );
}
