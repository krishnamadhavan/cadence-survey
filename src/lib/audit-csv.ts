import { sanitizeSpreadsheetValue } from "@/lib/spreadsheet";

const actionLabel: Record<string, string> = {
  "admin.added": "Admin added",
  "admin.removed": "Admin removed",
  "manager.assigned": "Manager assigned",
  "manager.unassigned": "Manager unassigned",
  "manager.portal_password_set": "Portal password set",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "anonymity_floor.changed": "Anonymity floor",
  "employees.reassigned": "People moved",
  "employees.attributes_set": "Attributes set",
  "team.merged": "Team merged",
};

export function auditActionLabel(action: string): string {
  return actionLabel[action] ?? action;
}

export type AuditCsvRow = {
  createdAt: string;
  actorEmail: string;
  action: string;
  summary: string;
};

export function buildAuditCsv(events: AuditCsvRow[]): string {
  const lines = [csvLine(["When", "Who", "Action", "Detail"])];
  for (const event of events) {
    lines.push(
      csvLine([
        event.createdAt,
        event.actorEmail,
        auditActionLabel(event.action),
        event.summary,
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(sanitizeSpreadsheetValue(value));
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}
