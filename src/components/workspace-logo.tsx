import { getWorkspaceLogoStamp } from "@/db/settings";
import { WorkspaceLogoMark } from "@/components/workspace-logo-mark";

export async function WorkspaceLogo() {
  const stamp = await readWorkspaceLogoStamp();
  if (stamp === null) {
    return null;
  }
  return <WorkspaceLogoMark stamp={stamp} />;
}

async function readWorkspaceLogoStamp(): Promise<number | null> {
  try {
    return await getWorkspaceLogoStamp();
  } catch {
    return null;
  }
}
