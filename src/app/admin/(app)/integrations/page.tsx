import { listApiKeys } from "@/db/api-keys";
import { getResultsWebhookUrl } from "@/db/settings";
import { IntegrationsPanel } from "./integrations-panel";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  let keys: Awaited<ReturnType<typeof listApiKeys>> = [];
  let webhookUrl: string | null = null;
  let dbError = false;

  try {
    keys = await listApiKeys();
    webhookUrl = await getResultsWebhookUrl();
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <IntegrationsPanel
        keys={keys}
        webhookUrl={webhookUrl}
        dbError={dbError}
      />
    </div>
  );
}
