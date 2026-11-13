// @subject packages/client/src/components/face-strip.tsx
// The overflow tile is one more cell of the row: it starts and ends where the faces beside it do.
import { accessibilityScan } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { FaceStripInitialsStory, FaceStripTileStory } from "./_face-strip-stories.tsx";

const STORY = "tests/client/components/_face-strip-stories/FaceStripTileStory";
const INITIALS_STORY = "tests/client/components/_face-strip-stories/FaceStripInitialsStory";
const LABEL_MISMATCH = "label-content-name-mismatch";

test("a face's avatar initials stay out of the visible label axe compares with the face's name", async ({ mount, page }) => {
  const component = await mount<typeof FaceStripInitialsStory>(INITIALS_STORY);
  const face = component.getByRole("button", { name: "Open Ada Lovelace", exact: true });
  await expect(face).toBeVisible();
  const result = await accessibilityScan(page);
  expect(result.violations.find(({ id }) => id === LABEL_MISMATCH)?.nodes).toBeUndefined();
  await expect(face).toHaveText("");
});

test("the popup the overflow tile opens is a dialog with the overflow label as its name", async ({ mount, page }) => {
  const component = await mount<typeof FaceStripTileStory>(STORY, { caption: false });
  await component.locator("[data-face-overflow]").click();
  await expect(page.getByRole("dialog", { name: "Choose another face", exact: true })).toBeVisible();
  const result = await accessibilityScan(page);
  expect(result.violations.find(({ id }) => id === "aria-dialog-name")?.nodes).toBeUndefined();
});

for (const caption of [true, false]) {
  test(`${caption ? "a captioned" : "an uncaptioned"} overflow tile's name holds the text it shows`, async ({ mount, page }) => {
    const component = await mount<typeof FaceStripTileStory>(STORY, { caption });
    await expect(component.locator("[data-face-overflow]")).toBeVisible();
    const result = await accessibilityScan(page);
    const tileNodes = (rules: typeof result.violations): readonly string[] =>
      (rules.find(({ id }) => id === LABEL_MISMATCH)?.nodes ?? []).map(({ html }) => html).filter((html) => html.includes("data-face-overflow"));
    expect(tileNodes(result.violations)).toEqual([]);
    // The rule judged the tile: a tile the scan skipped would pass the line above too.
    expect(tileNodes(result.passes)).toHaveLength(1);
  });

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
