import type { TeamHealth } from "@/db/results";

export function followUpFor(health: TeamHealth): string | null {
  if (health === "low") {
    return "Meet this team this week and agree one change before the next pulse.";
  }
  if (health === "watch") {
    return "Check in with this team and ask what is slipping before the next pulse.";
  }
  return null;
}
