// A row's action controls that together outgrow the row wrap onto further lines inside it. A control cut at the row's edge cannot be
// pressed, and a row wider than its page scrolls the page sideways. The call site passes the controls bare, with no class.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale, sidewaysReach } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { ActionsStory } from "./_actions-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_actions-stories/ActionsStory";
const PHONE_WIDTH = 390;
const LABELS = ["Edit", "Duplicate", "Archive", "Delete"] as const;
const TEXT_SCALES = [2, 3] as const;

for (const scale of TEXT_SCALES) {
  test(`several action controls stay inside the row and the pane at ${String(scale * 100)}% text on a phone`, async ({ mount, page }) => {
    await page.setViewportSize({ width: PHONE_WIDTH, height: 844 });
    const component = await mount<typeof ActionsStory>(STORY, { width: PHONE_WIDTH, labels: LABELS });
    await setRootFontScale(page, channelName("fontScale"), scale);
    const row = component.locator('[data-slot="list-row-root"]');
    const controls = row.locator('[data-slot="list-row-actions"]').getByRole("button");
    await expect(controls).toHaveCount(LABELS.length);

    const pane = await row.locator("xpath=..").evaluate(sidewaysReach);
    expect(pane.scrolls).toBeLessThanOrEqual(SUBPIXEL);
    expect(pane.wideners).toEqual([]);

    const rowEdge = await row.evaluate((root) => root.getBoundingClientRect().right);
    const edges = await controls.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().right));
    for (const right of edges) {
      expect(right).toBeLessThanOrEqual(rowEdge + SUBPIXEL);
    }
  });
}
