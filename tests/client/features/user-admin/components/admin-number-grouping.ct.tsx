import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { AdminActionGroupsStory } from "./_admin-action-groups-stories.tsx";

const STORY = "tests/client/features/user-admin/components/_admin-action-groups-stories/AdminActionGroupsStory";
const CAP_LABEL = "Databank upload cap (bytes)";
// A separator-free reading of a number over 999: the digits a person types, never a locale's grouping.
const RAW_DIGITS = /^\d{4,}$/u;

test("an editable count reads as the digits typed, and its bounds and default agree with the input", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const appearance = appearanceSettingsSchema.parse({});
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.getAppSettingsWithOverrides"]));
  await mount<typeof AdminActionGroupsStory>(STORY, { width: 960, appearance });
  const field = page.getByRole("textbox", { name: CAP_LABEL, exact: true });
  await expect(field).toHaveValue(RAW_DIGITS);
  const value = await field.inputValue();
  const description = (
    await field.evaluate((input) =>
      [...(input.getAttribute("aria-describedby") ?? "").split(" ")].map((id) => document.getElementById(id)?.textContent ?? "").join(" "),
    )
  ).trim();
  expect(description).toContain(`deployment default: ${value}.`);
  expect(description).toMatch(/Minimum \d{6,}(?!,)/u);
  expect(description).not.toMatch(/\d,\d{3}/u);
});
