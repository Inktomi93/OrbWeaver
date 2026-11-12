// @subject packages/client/src/features/refinery/components/teaching-state.tsx
// The refinery landing's character list hands the wheel on at its ends. At the largest desktop text the list is taller than the pane, so a
// pointer resting on it must still be able to reach the rest of the landing: the wheel scrolls the list to its end and then the pane.
// The shell and the landing are the production ones over a corpus root, and the wheel is a real one.

import { testId } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "refinery.listSessions", "character.list"] as const;
const VIEWPORT = { width: 1440, height: 900 } as const;
// Enough characters that the list has far more rows than any window shows.
const CHARACTER_COUNT = 40;
const WHEEL_STEP_PX = 1200;
const WHEEL_INTERVAL_MS = 50;

/** Whether the steps row under the list has come on screen. */
async function onScreen(steps: Locator): Promise<boolean> {
  const box = await steps.boundingBox();
  return box !== null && box.y < VIEWPORT.height;
}

test.use({ viewport: VIEWPORT });

test("a wheel resting on the landing's character list reaches the rest of the landing at the largest app text", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  for (let index = 0; index < CHARACTER_COUNT; index += 1) {
    await caller.character.create({
      input: createCharacterSchema.parse({ handle: `wheel-witness-${String(index)}`, name: `Wheel witness ${String(index)}`, description: "A keeper." }),
    });
  }
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: ENLARGED_APPEARANCE_SETTINGS });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await seedShellState(page, { activeSection: "refinery", panelOverrides: { refinery: { list: "collapsed", context: "collapsed" } } });
  await mount<typeof ShellAmbientStory>(STORY, {});

  const list = page.getByRole("listbox");
  const steps = page.getByTestId(testId("refineryTeachingSteps"));
  await expect(list).toBeVisible();
  // Positive controls: the list holds more than its box shows, and the steps under it start off screen.
  expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await list.scrollIntoViewIfNeeded();
  expect(await onScreen(steps)).toBe(false);
  const box = await list.boundingBox();
  if (box === null) {
    throw new Error("The landing's list has no box");
  }
  // The pointer rests inside the part of the list that is on screen.
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, VIEWPORT.height);
  await page.mouse.move(box.x + box.width / 2, (top + bottom) / 2);

  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, WHEEL_STEP_PX);
        return await onScreen(steps);
      },
      { intervals: [WHEEL_INTERVAL_MS] },
    )
    .toBe(true);
});
