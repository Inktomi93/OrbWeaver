// Revoking one device signs it out with no way back, so the per-session Revoke asks first and Cancel writes nothing.
import { DIALOG_VERBS } from "@orb/client/lib";
import { brandedId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { revokeSessionName, userActionsName } from "#client/features/user-admin/lib/admin-model.ts";
import { ADMIN_SESSIONS_NAME, SESSION_REVOKE_VERB } from "#client/features/user-admin/lib/user-admin-names.ts";
import type { AdminUsersStory } from "./_admin-users-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-users-stories/AdminUsersStory";
const DEVICE = "ct-member-laptop";

test("a session's Revoke waits for its confirm: Cancel keeps the session, the confirm revokes it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const handle = brandedId("Handle").parse("signed-in-member");
  const member = await caller.admin.createUser({ handle, password: "signed-in-member-password" });
  await root.app.sessions.create({ userId: member.id, userAgent: DEVICE });
  const routes = await routeTrpc(
    page,
    serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "admin.listUsers", "admin.listSessions", "admin.revokeSession"]),
  );
  await mount<typeof AdminUsersStory>(STORY, {});

  await page.getByRole("button", { name: userActionsName(handle), exact: true }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: ADMIN_SESSIONS_NAME, exact: true }).click();
  const revoke = page.getByRole("dialog").getByRole("button", { name: revokeSessionName(DEVICE), exact: true });
  await revoke.click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(revoke).toBeVisible();
  expect(routes.count("admin.revokeSession")).toBe(0);
  expect(nonEmpty(await caller.admin.listSessions({ userId: member.id }))[0].revokedAt).toBeNull();

  await revoke.click();
  await confirm.getByRole("button", { name: SESSION_REVOKE_VERB, exact: true }).click();
  await expect(revoke).toHaveCount(0);
  expect(nonEmpty(await caller.admin.listSessions({ userId: member.id }))[0].revokedAt).not.toBeNull();
});
