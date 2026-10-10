import { redirect } from "next/navigation";
import { readAdminTotpProfile } from "@/db/admin-totp";
import { getAdminSessionUser } from "@/lib/admin";
import { totpQrSvg } from "@/lib/totp-qr";
import { TotpPanel } from "./totp-panel";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const admin = await getAdminSessionUser();
  if (!admin) {
    redirect("/admin/login?next=/admin/profile");
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
      <p className="mt-3 text-ink/60">Signed in as {admin.email}</p>
      {loadError || !profile ? (
        <p className="mt-8 text-ink/70">Could not load authenticator settings.</p>
      ) : (
        <TotpPanel profile={profile} />
      )}
    </div>
  );
}
