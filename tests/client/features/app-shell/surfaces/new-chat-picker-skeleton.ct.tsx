// The New chat picker's skeleton holds the box of the picker that replaces it, so the dialog does not jump when the library arrives. Every cell is a
// device's first-ever open: no box is remembered yet, so the declared box is all the skeleton has. The library is longer than a page, so the picker's
// footer is there at load. A library with saved rosters adds a door row above the picker. A cold first open cannot know about it, because the rosters
// arrive in the same response as the library, so a portrait or desktop cell with rosters opens on a device that already cached the roster list. A
// landscape phone has no such row, and its picker takes whatever room the dialog leaves.
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdCorpusProcedure, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { AppShellModalStory, AppShellWarmRostersNewChatStory } from "./_app-shell-stories.tsx";
import { SHELL_STORIES } from "./app-shell-ct.ts";

const STORY = `${SHELL_STORIES}/AppShellModalStory`;
const SETTLE_TOLERANCE_PX = 1;
const RESERVED = "[data-reserve-key]";
const COMMAND_ROOT = '[data-slot="command-root"]';
const DECLARED_BOX = `var(${TOKENS["height.picker-box"].cssVar})`;
const DECLARED_BOX_WITH_DOOR = `calc(${DECLARED_BOX} + var(${TOKENS["height.picker-door-row"].cssVar}))`;
const WARM_STORY = `${SHELL_STORIES}/AppShellWarmRostersNewChatStory`;

const CELLS = [
  { name: "desktop", width: 1440, height: 900, coarse: false, landscape: false },
  { name: "coarse portrait", width: 390, height: 844, coarse: true, landscape: false },
  { name: "coarse landscape", width: 844, height: 390, coarse: true, landscape: true },
  { name: "coarse small landscape", width: 568, height: 320, coarse: true, landscape: true },
] as const;

// A landscape phone has no door row in the box, so both arms read cold. Elsewhere the row is in the box only for a device that cached the rosters.
const ROSTER_ARMS = [
  { rosters: true, warm: false },
  { rosters: false, warm: false },
] as const;
const WARM_ARMS = [
  { rosters: false, warm: false },
  { rosters: true, warm: true },
] as const;

for (const cell of CELLS) {
  for (const { rosters, warm } of cell.landscape ? ROSTER_ARMS : WARM_ARMS) {
    test.describe(`on a ${cell.name} screen, ${rosters ? "with" : "without"} saved rosters${warm ? " already cached" : ""}`, () => {
      test.use({ viewport: { width: cell.width, height: cell.height }, hasTouch: cell.coarse, isMobile: cell.coarse });

      test("the dialog and the picker keep their height from the skeleton to the list", async ({ corpus, mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        if (!rosters) {
          for (const roster of await caller.rosterPreset.list()) {
            await caller.rosterPreset.remove({ presetId: roster.id });
          }
        }
        const held = holdCorpusProcedure(caller, "character.list");
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
          ...held.routes,
        });
        await seedShellState(page, { activeSection: "chats" });
        if (warm) {
          await mount<typeof AppShellWarmRostersNewChatStory>(WARM_STORY);
        } else {
          await mount<typeof AppShellModalStory>(STORY, { modalId: "newChat" });
        }
        await held.requested;
        const dialog = page.getByRole("dialog");
        await expect(dialog.locator(RESERVED)).toBeVisible();
        await expect(dialog.locator(RESERVED)).toHaveAttribute("data-tile-reserved", warm ? DECLARED_BOX_WITH_DOOR : DECLARED_BOX);
        const skeleton = { box: await dialog.locator(RESERVED).boundingBox(), popup: await dialog.boundingBox() };
        held.release();
        await expect(dialog.locator(COMMAND_ROOT)).toBeVisible();
        // The boundary's settled box holds the picker and the row above it, so that is what the reserved box stands in for.
        const loaded = { box: await dialog.locator(COMMAND_ROOT).locator("xpath=..").boundingBox(), popup: await dialog.boundingBox() };
        expect(
          Math.abs((loaded.box?.height ?? 0) - (skeleton.box?.height ?? 0)),
          `the skeleton held ${String(skeleton.box?.height)}px and the picker ${String(loaded.box?.height)}px`,
        ).toBeLessThanOrEqual(SETTLE_TOLERANCE_PX);
        expect(
          Math.abs((loaded.popup?.height ?? 0) - (skeleton.popup?.height ?? 0)),
          `the dialog went from ${String(skeleton.popup?.height)}px to ${String(loaded.popup?.height)}px`,
        ).toBeLessThanOrEqual(SETTLE_TOLERANCE_PX);
      });
    });
  }
}
