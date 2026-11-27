// @subject packages/client/src/features/roster-preset/components/roster-collection-rows.tsx
// A saved-roster row in the library says when the roster was last saved, after the member names it counts.
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ROSTER_GROUP_LABEL } from "#client/features/roster-preset/lib/roster-names.ts";
import { SAVED_STAMP_LEAD } from "#client/lib/stamp-copy.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const PROCEDURES = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "rosterPreset.list"] as const;

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test("a roster row in the library says when the roster was last saved, after its member names", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const rosters = await caller.rosterPreset.list();
  const [first] = rosters;
  if (first === undefined) {
    throw new Error("The corpus must hold a saved roster");
  }
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, PROCEDURES) });
  await seedShellState(page, { activeSection: "config" });
  await mount<typeof ShellAmbientStory>(STORY, {});
  await page
    .getByRole("button", { name: new RegExp(`^${RegExp.escape(ROSTER_GROUP_LABEL)}`, "u") })
    .first()
    .click();
  const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: first.name }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(SAVED_STAMP_LEAD)).toBeVisible();
  // The stamp closes the line: a date between the census and the names splits the facts from the list they count.
  const memberName = first.members[0]?.name;
  if (memberName === undefined) {
    throw new Error("The corpus roster must seat a member");
  }
  const line = (await row.textContent()) ?? "";
  expect(line.indexOf(SAVED_STAMP_LEAD)).toBeGreaterThan(line.indexOf(memberName));
});
