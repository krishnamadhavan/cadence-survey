import { redirect } from "next/navigation";
import { readOwnAdminAccount } from "@/db/admin-profile";
import { readAdminTotpProfile } from "@/db/admin-totp";
import { getAdminSessionUser } from "@/lib/admin";
import { totpQrSvg } from "@/lib/totp-qr";
import { AccountPanel } from "./account-panel";
import { TotpPanel } from "./totp-panel";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const admin = await getAdminSessionUser();
  if (!admin) {
    redirect("/admin/login?next=/admin/profile");
  }

  let account: { email: string; name: string | null } | null = null;
  let accountError = false;
  try {
    const row = await readOwnAdminAccount(admin.id);
    account = { email: row.email, name: row.name };
  } catch {
    accountError = true;
  }

  let profile:
    | { status: "off" }
    | { status: "on" }
    | { status: "pending"; manualKey: string; qrSvg: string }
    | null = null;
  let loadError = false;
  try {
    const stored = await readAdminTotpProfile(admin.id);
    profile =
      stored.status === "pending"
        ? {
            status: "pending",
            manualKey: stored.manualKey,
            qrSvg: await totpQrSvg(stored.otpauthUrl),
          }
        : stored;
  } catch {
    loadError = true;
  }

  return (
    <div className="w-full">
      <h1 className="font-serif text-4xl text-ink">Profile</h1>
      <p className="mt-2 max-w-2xl text-ink/60">
        Update the display name and email for this account, or change the password.
      </p>
      {account ? (
        <p className="mt-3 text-ink/60">
          {account.name ? (
            <>
              <span className="font-medium text-ink">{account.name}</span>
              <span className="text-ink/40"> · </span>
            </>
          ) : null}
          Signed in as {account.email}
        </p>
      ) : null}
      {accountError || !account ? (
        <p className="mt-8 text-ink/70">Could not load your account.</p>
      ) : (
        <AccountPanel email={account.email} name={account.name} />
      )}
      {loadError || !profile ? (
        <p className="mt-8 text-ink/70">Could not load authenticator settings.</p>
      ) : (
        <TotpPanel profile={profile} />
      )}
    </div>
  );
}
