import assert from "node:assert/strict";
import { test } from "node:test";
import { auditActionLabel, buildAuditCsv } from "./audit-csv";

test("audit csv lists who did what and when, newest first as given", () => {
  const csv = buildAuditCsv([
    {
      createdAt: "2026-03-02T10:00:00.000Z",
      actorEmail: "ada@cadence.test",
      action: "team.merged",
      summary: "Merged Design into Product",
    },
    {
      createdAt: "2026-03-01T10:00:00.000Z",
      actorEmail: "ada, admin@cadence.test",
      action: "admin.added",
      summary: '=HYPERLINK("http://evil")',
    },
  ]);

  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "When,Who,Action,Detail");
  assert.equal(
    lines[1],
    "2026-03-02T10:00:00.000Z,ada@cadence.test,Team merged,Merged Design into Product",
  );
  assert.equal(
    lines[2],
    '2026-03-01T10:00:00.000Z,"ada, admin@cadence.test",Admin added,"\'=HYPERLINK(""http://evil"")"',
  );
  assert.equal(auditActionLabel("unknown.action"), "unknown.action");
  assert.equal(
    auditActionLabel("manager.portal_password_set"),
    "Portal password set",
  );
  assert.equal(auditActionLabel("employees.attributes_set"), "Attributes set");
  assert.equal(auditActionLabel("admin.totp_enabled"), "Authenticator on");
  assert.equal(auditActionLabel("admin.totp_disabled"), "Authenticator off");
  assert.equal(auditActionLabel("results_webhook.changed"), "Results webhook");
  assert.equal(auditActionLabel("responses.imported"), "Responses imported");
  assert.equal(auditActionLabel("workspace_logo.changed"), "Workspace logo");
  assert.equal(auditActionLabel("admin.profile_updated"), "Profile updated");
  assert.equal(auditActionLabel("admin.password_changed"), "Password changed");
});
