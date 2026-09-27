import { listApiKeys } from "@/db/api-keys";
import { IntegrationsPanel } from "./integrations-panel";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  let keys: Awaited<ReturnType<typeof listApiKeys>> = [];
  let dbError = false;

  try {
    keys = await listApiKeys();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <IntegrationsPanel keys={keys} dbError={dbError} />
    </div>
  );
}
