// The title line keeps its reading order (name, qualifier, markers) at every width. Beside the name when they fit; a qualifier too long
// for even an empty name takes the next line and truncates there, and the markers follow it. Nothing leaves the row.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL } from "@orb/testkit/browser/spec";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { TitleQualifierStory } from "./_title-qualifier-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_title-qualifier-stories/TitleQualifierStory";
const WIDTH = 373;

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

interface Line {
  readonly root: Box;
  readonly title: Box;
  readonly qualifier: Box;
  readonly markers: Box;
  readonly qualifierCut: boolean;
}

function line(row: Locator): Promise<Line> {
  return row.evaluate((root) => {
    const part = (slot: string): HTMLElement => {
      const found = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
      if (found === null) {
        throw new Error(`list row has no ${slot}`);
      }
      return found;
    };
    const box = (element: Element): Box => {
      const { top, bottom, left, right } = element.getBoundingClientRect();
      return { top, bottom, left, right };
    };
    const qualifier = part("list-row-title-qualifier");
    return {
      root: box(root),
      title: box(part("list-row-title")),
      qualifier: box(qualifier),
      markers: box(part("list-row-markers")),
      qualifierCut: qualifier.scrollWidth > qualifier.clientWidth,
    };
  });
}

test("a qualifier that fits sits beside the name with the markers after it", async ({ mount }) => {
  const component = await mount<typeof TitleQualifierStory>(STORY, { width: WIDTH });
  const short = await line(component.locator('[data-slot="list-row-root"]').nth(0));
  expect(short.qualifier.top).toBeLessThan(short.title.bottom);
  expect(short.markers.top).toBeLessThan(short.title.bottom);
  expect(short.markers.left).toBeGreaterThanOrEqual(short.qualifier.right - SUBPIXEL);
  expect(short.qualifierCut).toBe(false);
});

test("a qualifier too long for the name's line takes the next line, truncates there, and the markers follow it inside the row", async ({ mount }) => {
  const component = await mount<typeof TitleQualifierStory>(STORY, { width: WIDTH });
  const long = await line(component.locator('[data-slot="list-row-root"]').nth(1));
  expect(long.qualifier.top).toBeGreaterThanOrEqual(long.title.bottom - SUBPIXEL);
  expect(long.qualifierCut).toBe(true);
  expect(long.title.right).toBeGreaterThan(long.title.left);
  // The truncated qualifier fills its line, so the markers follow on the line below it.
  expect(long.markers.top).toBeGreaterThanOrEqual(long.qualifier.bottom - SUBPIXEL);
  for (const part of [long.qualifier, long.markers]) {
    expect(part.right).toBeLessThanOrEqual(long.root.right + SUBPIXEL);
  }
});
