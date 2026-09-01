import "./../lib/load-env";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { db, pg } from "@/db/client";
import { teams } from "@/db/schema";
import {
  TeamConflictError,
  TeamInUseError,
  createTeam,
  deleteTeam,
  listTeamsForAdmin,
  updateTeam,
} from "./teams";

const stamp = Date.now();
const name = `QA Team ${stamp}`;
const slug = `qa-team-${stamp}`;

test("create, list, rename, and delete a team; block conflicts and in-use deletes", async (t) => {
  t.after(async () => {
    await db.delete(teams).where(eq(teams.slug, slug));
    await db.delete(teams).where(eq(teams.slug, `${slug}-renamed`));
    await pg.end({ timeout: 2 });
  });

  const created = await createTeam({ name, slug });
  assert.equal(created.name, name);
  assert.equal(created.slug, slug);

  const listed = await listTeamsForAdmin();
  const found = listed.find((team) => team.id === created.id);
  assert.ok(found);
  assert.equal(found?.employeeCount, 0);
  assert.equal(found?.responseCount, 0);

  await assert.rejects(
    () => createTeam({ name, slug: `${slug}-other` }),
    TeamConflictError,
  );

  const renamed = await updateTeam({
    id: created.id,
    name: `${name} Renamed`,
    slug: `${slug}-renamed`,
  });
  assert.equal(renamed.slug, `${slug}-renamed`);

  const engineering = listed.find((team) => team.slug === "engineering");
  if (engineering && engineering.employeeCount + engineering.responseCount > 0) {
    await assert.rejects(() => deleteTeam(engineering.id), TeamInUseError);
  }

  await deleteTeam(renamed.id);
  const after = await listTeamsForAdmin();
  assert.equal(
    after.some((team) => team.id === created.id),
    false,
  );
});
