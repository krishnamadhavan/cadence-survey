import { getAnonymityFloor, getWorkspaceLogoStamp } from "@/db/settings";
import { SettingsPanel } from "./settings-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  let floor = 3;
  let logoStamp: number | null = null;
  let dbError = false;
  try {
    floor = await getAnonymityFloor();
    logoStamp = await getWorkspaceLogoStamp();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <SettingsPanel key={floor} floor={floor} logoStamp={logoStamp} dbError={dbError} />
    </div>
  );
}
