import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  if (await hasAdminSession()) {
    redirect("/admin");
  }

  const { next } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Admin</h1>
      <p className="mt-3 text-ink/70">
        Results stay off the public link. Sign in with the token from{" "}
        <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">
          ADMIN_TOKEN
        </code>
        .
      </p>
      <div className="mt-8">
        <LoginForm nextPath={next && next.startsWith("/admin") ? next : "/admin"} />
      </div>
    </main>
  );
}
