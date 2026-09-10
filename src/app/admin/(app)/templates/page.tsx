import { listTemplatesForAdmin } from "@/db/templates";
import { TemplatesPanel } from "./templates-panel";

export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  let templates: Awaited<ReturnType<typeof listTemplatesForAdmin>> = [];
  let dbError = false;

  try {
    templates = await listTemplatesForAdmin();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <TemplatesPanel templates={templates} dbError={dbError} />
    </div>
  );
}
