// @subject packages/client/src/components/face-strip.tsx
// The overflow tile is one more cell of the row: it starts and ends where the faces beside it do.
import { expect, test } from "@playwright/test";
import type { FaceStripTileStory } from "./_face-strip-stories.tsx";

const STORY = "tests/client/components/_face-strip-stories/FaceStripTileStory";

for (const caption of [true, false]) {
  test(`${caption ? "a captioned" : "an uncaptioned"} strip seats its overflow tile level with its faces`, async ({ mount }) => {
    const component = await mount<typeof FaceStripTileStory>(STORY, { caption });
    const tile = component.locator("[data-face-overflow]");
    await expect(tile).toBeVisible();
    const cell = (node: ReturnType<typeof component.locator>): Promise<{ top: number; height: number }> =>
      node.locator("xpath=ancestor::li[1]").evaluate((li) => {
        const box = li.getBoundingClientRect();
        return { top: box.top, height: box.height };
      });
    const face = await cell(component.getByRole("button", { name: "Open Alpha", exact: true }));
    const folded = await cell(tile);
    expect(folded.top).toBeCloseTo(face.top, 1);
    expect(folded.height).toBeCloseTo(face.height, 1);
  });
}
