// Each account's enabled switch keeps one stable name for the account; `aria-checked` alone carries the state.
import { brandedId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { userEnabledFieldName } from "#client/features/user-admin/lib/admin-model.ts";
import type { AdminUsersStory } from "./_admin-users-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-users-stories/AdminUsersStory";
const handleSchema = brandedId("Handle");

test("two accounts in opposite states are found by their stable names, and a flip moves only aria-checked", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const active = handleSchema.parse("active-member");
  const paused = handleSchema.parse("paused-member");
  await caller.admin.createUser({ handle: active, password: "active-member-password" });
  const pausedRow = await caller.admin.createUser({ handle: paused, password: "paused-member-password" });
  await caller.admin.setEnabled({ userId: pausedRow.id, enabled: false });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "admin.listUsers", "admin.setEnabled", "admin.listSessions"]),
  );
  await mount<typeof AdminUsersStory>(STORY, {});

  const activeSwitch = page.getByRole("switch", { name: userEnabledFieldName(active), exact: true });
  const pausedSwitch = page.getByRole("switch", { name: userEnabledFieldName(paused), exact: true });
  await expect(activeSwitch).toHaveAttribute("aria-checked", "true");
  await expect(pausedSwitch).toHaveAttribute("aria-checked", "false");
  await pausedSwitch.click();
  await expect(pausedSwitch).toHaveAttribute("aria-checked", "true");
  await expect(activeSwitch).toHaveAttribute("aria-checked", "true");
});
