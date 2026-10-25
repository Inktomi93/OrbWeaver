import { expect, test } from "@playwright/test";
import type { MediaGridSpotlightStory } from "./_spotlight-stories.tsx";

const STORY = "tests/ui/primitives/media-grid/_spotlight-stories/MediaGridSpotlightStory";
const CELL = '[data-slot="media-grid-cell"]';
const OFFSET = { x: 12, y: 20 };

// The property names are the stylesheet contract (primitives.css reads them; the custom-property lint binds the two), so
// the test reads whatever custom properties the primitive wrote rather than retyping them.
test("a pointer move over a cell writes the pointer's offset into the cell's own custom properties", async ({ mount, page }) => {
  await mount<typeof MediaGridSpotlightStory>(STORY);
  const cell = page.locator(CELL).first();
  await expect(cell).toBeVisible();
  const box = await cell.boundingBox();
  await page.mouse.move((box?.x ?? Number.NaN) + OFFSET.x, (box?.y ?? Number.NaN) + OFFSET.y);
  const written = (): Promise<number[]> =>
    cell.evaluate((node) =>
      node instanceof HTMLElement
        ? [...node.style].filter((name) => name.startsWith("--")).map((name) => Number.parseFloat(node.style.getPropertyValue(name)))
        : [],
    );
  await expect.poll(async () => (await written()).length).toBe(2);
  const [inline, block] = await written();
  expect(inline).toBeCloseTo(OFFSET.x, 0);
  expect(block).toBeCloseTo(OFFSET.y, 0);
});
