import { getAnonymityFloor } from "@/db/settings";
import { SettingsPanel } from "./settings-panel";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  let floor = 3;
  let dbError = false;
  try {
    floor = await getAnonymityFloor();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <SettingsPanel key={floor} floor={floor} dbError={dbError} />
    </div>
  );
}
