import { and, asc, count, desc, gte, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { AUDIT_ACTION_LABELS } from "@/lib/audit-csv";
import { escapeLike, type AuditDirection, type AuditSort } from "@/lib/audit-search";

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
  | "results_webhook.changed"
  | "responses.imported"
  | "workspace_logo.changed"
  | "admin.role_changed";

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

const eventColumns = {
  id: auditEvents.id,
  actorEmail: auditEvents.actorEmail,
  action: auditEvents.action,
  summary: auditEvents.summary,
  createdAt: auditEvents.createdAt,
};

function toEvent(row: {
  id: string;
  actorEmail: string;
  action: string;
  summary: string;
  createdAt: Date;
}): AuditEvent {
  return {
    id: row.id,
    actorEmail: row.actorEmail,
    action: row.action,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

function actionLabelSql() {
  const whenLabels = Object.entries(AUDIT_ACTION_LABELS).map(
    ([code, label]) => sql`WHEN ${code} THEN ${label}`,
  );
  return sql`CASE ${auditEvents.action} ${sql.join(whenLabels, sql` `)} ELSE ${auditEvents.action} END`;
}

function sortExpression(sort: AuditSort): SQL {
  if (sort === "who") {
    return sql`lower(${auditEvents.actorEmail})`;
  }
  if (sort === "action") {
    return sql`lower(${actionLabelSql()})`;
  }
  if (sort === "detail") {
    return sql`lower(${auditEvents.summary})`;
  }
  return sql`${auditEvents.createdAt}`;
}

function ordered(expression: SQL, direction: AuditDirection) {
  return direction === "asc" ? asc(expression) : desc(expression);
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const rows = await db
    .select(eventColumns)
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id));
  return rows.map(toEvent);
}

export async function searchAuditEvents(input: {
  text: string;
  from: Date | null;
  toExclusive: Date | null;
  sort: AuditSort;
  direction: AuditDirection;
  page: number;
  pageSize: number;
}): Promise<{ events: AuditEvent[]; total: number; page: number }> {
  const filters = [];
  const text = input.text.trim();
  if (text) {
    const pattern = `%${escapeLike(text)}%`;
    const escape = "\\";
    filters.push(
      or(
        sql`${auditEvents.actorEmail} ILIKE ${pattern} ESCAPE ${escape}`,
        sql`${auditEvents.summary} ILIKE ${pattern} ESCAPE ${escape}`,
        sql`${auditEvents.action} ILIKE ${pattern} ESCAPE ${escape}`,
        sql`${actionLabelSql()} ILIKE ${pattern} ESCAPE ${escape}`,
      ),
    );
  }
  if (input.from) {
    filters.push(gte(auditEvents.createdAt, input.from));
  }
  if (input.toExclusive) {
    filters.push(lt(auditEvents.createdAt, input.toExclusive));
  }

  const where = and(...filters);
  const [counted] = await db.select({ total: count() }).from(auditEvents).where(where);
  const total = Number(counted?.total ?? 0);
  // The audit page clamps the URL to 5–200. Tests page with a size of 2.
  const requestedSize = Math.floor(input.pageSize);
  const pageSize = Math.min(200, Math.max(1, Number.isFinite(requestedSize) ? requestedSize : 1));
  const requestedPage = Math.floor(input.page);
  const safePage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
  const page = Math.min(safePage, pageCount);
  const primary = sortExpression(input.sort);
  const orderBy =
    input.sort === "when"
      ? [ordered(primary, input.direction), ordered(sql`${auditEvents.id}`, input.direction)]
      : [ordered(primary, input.direction), desc(auditEvents.createdAt), desc(auditEvents.id)];

  const rows = await db
    .select(eventColumns)
    .from(auditEvents)
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { events: rows.map(toEvent), total, page };
}
