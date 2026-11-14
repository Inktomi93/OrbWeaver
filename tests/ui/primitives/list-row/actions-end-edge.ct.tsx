// A row's actions that cannot sit beside its body drop to a line of their own, and on that line they sit at the row's end edge: a
// person looks for a row's actions there, and a cluster at the start of its line reads as detached from its row.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { ActionsStory } from "./_actions-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_actions-stories/ActionsStory";
const PHONE_WIDTH = 390;
const TEXT_200 = 2;
// One control narrower than the row but wider than the room the body leaves beside it at this text size.
const LABELS = ["Duplicate chat"] as const;

test("actions that wrap under the body at 200% text on a phone end at the row's end edge", async ({ mount, page }) => {
  await page.setViewportSize({ width: PHONE_WIDTH, height: 844 });
  const component = await mount<typeof ActionsStory>(STORY, { width: PHONE_WIDTH, labels: LABELS });
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const row = component.locator('[data-slot="list-row-root"]');
  const shown = await row.evaluate((root) => {
    const part = (slot: string): DOMRect => {
      const found = root.querySelector(`[data-slot="${slot}"]`);
      if (found === null) {
        throw new Error(`list row has no ${slot}`);
      }
      return found.getBoundingClientRect();
    };
    return { row: root.getBoundingClientRect(), body: part("list-row-body"), actions: part("list-row-actions") };
  });
  // The premise: the actions are under the body, on a line of their own, and narrower than the row, so the end edge is not just the row's whole width.
  expect(shown.actions.top).toBeGreaterThanOrEqual(shown.body.bottom - SUBPIXEL);
  expect(shown.actions.width).toBeLessThan(shown.row.width - SUBPIXEL);
  expect(Math.abs(shown.actions.right - shown.row.right)).toBeLessThanOrEqual(SUBPIXEL);
});
