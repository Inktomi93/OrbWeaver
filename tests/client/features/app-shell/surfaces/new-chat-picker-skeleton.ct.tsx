// The New chat picker's skeleton holds the box of the picker that replaces it, so the dialog does not jump when the library arrives. A library with
// saved rosters adds a row above the picker that a first-ever open cannot know about; this device remembers the box it settled at from then on.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AppShellTemporaryNewChatStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellTemporaryNewChatStory`;
const SETTLE_TOLERANCE_PX = 1;
const RESERVED = "[data-reserve-key]";
const COMMAND_ROOT = '[data-slot="command-root"]';

test("the reserved skeleton box is the height of the picker that replaces it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const roster of await caller.rosterPreset.list()) {
    await caller.rosterPreset.remove({ presetId: roster.id });
  }
  const held = holdCorpusProcedure(caller, "character.list");
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
    ...held.routes,
  });
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof AppShellTemporaryNewChatStory>(STORY, {});
  await held.requested;
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(RESERVED)).toBeVisible();
  const skeleton = await dialog.locator(RESERVED).boundingBox();
  held.release();
  await expect(dialog.locator(COMMAND_ROOT)).toBeVisible();
  // The boundary's settled box holds the picker and the row above it, so that is what the reserved box stands in for.
  const loaded = await dialog.locator(COMMAND_ROOT).locator("xpath=..").boundingBox();
  expect(
    Math.abs((loaded?.height ?? 0) - (skeleton?.height ?? 0)),
    `the skeleton held ${String(skeleton?.height)}px and the picker ${String(loaded?.height)}px`,
  ).toBeLessThanOrEqual(SETTLE_TOLERANCE_PX);
});
