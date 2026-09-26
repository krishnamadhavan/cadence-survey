import { listSurveysForAdmin } from "@/db/queries";
import { SurveysPanel } from "./surveys-panel";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  let surveys: Awaited<ReturnType<typeof listSurveysForAdmin>> = [];
  let dbError = false;

  try {
    surveys = await listSurveysForAdmin();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <SurveysPanel surveys={surveys} dbError={dbError} />
    </div>
  );
}
