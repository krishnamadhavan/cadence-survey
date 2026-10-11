import assert from "node:assert/strict";
import { test } from "node:test";
import { navSectionsForRole } from "@/components/admin/admin-nav";
import {
  adminLandingPath,
  adminRoleLabel,
  adminRoleSwitchLabel,
  parseAdminRole,
  viewerMayOpen,
} from "./admin-role";

test("a viewer can open dashboards, reports, and their profile", () => {
  assert.equal(viewerMayOpen("/admin/dashboard"), true);
  assert.equal(viewerMayOpen("/admin/dashboard/"), true);
  assert.equal(viewerMayOpen("/admin/reports"), true);
  assert.equal(viewerMayOpen("/admin/reports/weekly-pulse"), true);
  assert.equal(viewerMayOpen("/admin/reports/weekly-pulse?team=abc"), true);
  assert.equal(viewerMayOpen("/admin/profile"), true);
  assert.equal(viewerMayOpen("/admin"), false);
  assert.equal(viewerMayOpen("/admin/s/weekly-pulse"), false);
  assert.equal(viewerMayOpen("/admin/recommendations"), false);
  assert.equal(viewerMayOpen("/admin/feedbacks"), false);
  assert.equal(viewerMayOpen("/admin/users"), false);
  assert.equal(viewerMayOpen("/admin/settings"), false);
  assert.equal(viewerMayOpen("/admin/employees"), false);
  assert.equal(viewerMayOpen("/administrator"), false);
});

test("login sends a viewer to an allowed page and keeps an admin on the requested one", () => {
  assert.equal(adminLandingPath("viewer", null), "/admin/dashboard");
  assert.equal(adminLandingPath("viewer", "/admin"), "/admin/dashboard");
  assert.equal(adminLandingPath("viewer", "/admin/users"), "/admin/dashboard");
  assert.equal(adminLandingPath("viewer", "/admin/login"), "/admin/dashboard");
  assert.equal(
    adminLandingPath("viewer", "/admin/reports/weekly-pulse?role=Eng"),
    "/admin/reports/weekly-pulse?role=Eng",
  );
  assert.equal(adminLandingPath("viewer", "/admin/profile"), "/admin/profile");
  assert.equal(adminLandingPath("admin", null), "/admin");
  assert.equal(adminLandingPath("admin", "/admin/settings"), "/admin/settings");
  assert.equal(adminLandingPath("admin", "https://evil.example/admin"), "/admin");
  assert.equal(parseAdminRole("admin"), "admin");
  assert.equal(parseAdminRole("viewer"), "viewer");
  assert.equal(parseAdminRole("owner"), null);
  assert.equal(parseAdminRole(""), null);
  assert.equal(adminRoleLabel("admin"), "Full access");
  assert.equal(adminRoleLabel("viewer"), "Viewer");
  assert.equal(adminRoleSwitchLabel("admin"), "Switch to viewer");
  assert.equal(adminRoleSwitchLabel("viewer"), "Switch to full access");
});

test("viewer navigation is the dashboard and reports", () => {
  assert.deepEqual(
    navSectionsForRole("viewer").flatMap((section) =>
      section.items.map((item) => item.href),
    ),
    ["/admin/dashboard", "/admin/reports"],
  );
  assert.equal(navSectionsForRole("admin").length, 5);
  assert.equal(
    navSectionsForRole("admin").some((section) => section.items.length === 0),
    false,
  );
});
