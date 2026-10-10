import { listApiKeys } from "@/db/api-keys";
import { getResultsWebhook } from "@/db/settings";
import { IntegrationsPanel } from "./integrations-panel";

export const dynamic = "force-dynamic";

export default async function AdminIntegrationsPage() {
  let keys: Awaited<ReturnType<typeof listApiKeys>> = [];
  let webhookUrl: string | null = null;
  let webhookSecret: string | null = null;
  let dbError = false;

  try {
    keys = await listApiKeys();
    const webhook = await getResultsWebhook();
    webhookUrl = webhook?.url ?? null;
    webhookSecret = webhook?.secret ?? null;
  } catch {
    dbError = true;
  }

  return (
    <div className="w-full">
      <IntegrationsPanel
        keys={keys}
        webhookUrl={webhookUrl}
        webhookSecret={webhookSecret}
        dbError={dbError}
      />
    </div>
  );
}
