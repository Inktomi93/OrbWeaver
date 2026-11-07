// A clipped line is a scroll container, so as a flex child it shrinks to the room its row leaves it and needs no
// `min-inline-0`. Measured per arm: the row does not overflow, the sibling keeps its width and the line is clipped.
import { expect, test } from "@playwright/test";
import type { TextTruncateStory } from "./_truncate-stories.tsx";

const STORY = "tests/ui/primitives/text/_truncate-stories/TextTruncateStory";
const CASES = ["fill", "plain", "heading"] as const;

for (const name of CASES) {
  test(`${name}: the clipped line gives way to its sibling and the row does not overflow`, async ({ mount }) => {
    const root = await mount<typeof TextTruncateStory>(STORY, {});
    const row = root.locator(`[data-case="${name}"]`);
    const line = row.locator("> :first-child");
    const sibling = row.locator(`[data-sibling="${name}"]`);
    const siblingBox = await sibling.boundingBox();
    const rowBox = await row.boundingBox();
    const lineBox = await line.boundingBox();
    expect(siblingBox, "sibling is laid out").not.toBeNull();
    expect(rowBox, "row is laid out").not.toBeNull();
    expect(lineBox, "line is laid out").not.toBeNull();
    expect(await row.evaluate((element) => element.scrollWidth - element.clientWidth), "row overflow").toBeLessThanOrEqual(0);
    expect(await line.evaluate((element) => element.scrollWidth - element.clientWidth), "line is clipped").toBeGreaterThan(0);
    expect((lineBox?.x ?? 0) + (lineBox?.width ?? 0), "line stays inside the row").toBeLessThanOrEqual((rowBox?.x ?? 0) + (rowBox?.width ?? 0));
    expect(siblingBox?.width, "sibling keeps its width").toBeGreaterThan(0);
  });
}
