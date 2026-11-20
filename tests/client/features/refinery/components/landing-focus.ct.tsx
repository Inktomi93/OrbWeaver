import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { REFINERY_START_SESSION_PICKER_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import type { RefineryLandingFocusStory } from "./_landing-focus-stories.tsx";

test("a landing focus request reaches the mounted refinery picker search", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "refinery.listSessions", "character.list"]));
  await mount<typeof RefineryLandingFocusStory>("tests/client/features/refinery/components/_landing-focus-stories/RefineryLandingFocusStory", {});
  const picker = page.getByRole("combobox", { name: REFINERY_START_SESSION_PICKER_NAME, exact: true });
  await expect(picker).toBeVisible();
  await page.getByRole("button", { name: "Focus landing picker", exact: true }).click();
  await expect(picker).toBeFocused();
});
