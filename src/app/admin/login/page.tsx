import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminSessionUser } from "@/lib/admin";
import { adminLandingPath } from "@/lib/admin-role";
import { TOTP_CHALLENGE_COOKIE, readTotpChallenge } from "@/lib/totp-challenge";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const admin = await getAdminSessionUser();
  if (admin) {
    redirect(admin.role === "admin" ? "/admin" : adminLandingPath("viewer", next ?? null));
  }
  let challengeEmail: string | null = null;
  try {
    const jar = await cookies();
    const challenge = await readTotpChallenge(jar.get(TOTP_CHALLENGE_COOKIE)?.value);
    challengeEmail = challenge?.email ?? null;
  } catch {
    challengeEmail = null;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-16">
      <p className="text-sm tracking-wide text-accent uppercase">Cadence</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Admin</h1>
      <p className="mt-3 text-ink/70">
        {challengeEmail
          ? "Enter the 6-digit code from your authenticator app."
          : "Results stay off the public link. Sign in with the seeded admin email and password."}
      </p>
      <div className="mt-8">
        <LoginForm
          nextPath={next && next.startsWith("/admin") ? next : "/admin"}
          challengeEmail={challengeEmail}
        />
      </div>
    </main>
  );
}
