import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

export type AuditAction =
  | "admin.added"
  | "admin.removed"
  | "manager.assigned"
  | "manager.unassigned"
  | "manager.portal_password_set"
  | "api_key.created"
  | "api_key.revoked"
  | "anonymity_floor.changed"
  | "employees.reassigned"
  | "employees.attributes_set"
  | "team.merged"
  | "admin.totp_enabled"
  | "admin.totp_disabled"
  | "results_webhook.changed";

export type AuditEvent = {
  id: string;
  actorEmail: string;
  action: string;
  summary: string;
  createdAt: string;
};

export async function recordAudit(
  input: {
    actorId: string | null;
    actorEmail: string;
    action: AuditAction;
    summary: string;
    createdAt?: Date;
  },
  tx: Pick<typeof db, "insert"> = db,
): Promise<void> {
  await tx.insert(auditEvents).values({
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    action: input.action,
    summary: input.summary,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const rows = await db
    .select({
      id: auditEvents.id,
      actorEmail: auditEvents.actorEmail,
      action: auditEvents.action,
      summary: auditEvents.summary,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
