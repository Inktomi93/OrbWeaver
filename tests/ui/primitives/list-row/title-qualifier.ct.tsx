// The title line keeps its reading order (name, qualifier, markers) at every width. Beside the name when they fit; a qualifier too long
// for even an empty name takes the next line and wraps there whole, starting on its first word, and the markers follow it. Nothing
// leaves the row, and two rows told apart only by their qualifier stay apart.
import { resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { QualifierPairStory, TitleQualifierStory } from "./_title-qualifier-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_title-qualifier-stories/TitleQualifierStory";
const PAIR_STORY = "tests/ui/primitives/list-row/_title-qualifier-stories/QualifierPairStory";
const WIDTH = 373;
const PHONE_WIDTH = 390;
const TEXT_200 = 2;

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
  readonly separator: Box;
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
      separator: box(part("list-row-title-separator")),
      markers: box(part("list-row-markers")),
      qualifierCut: qualifier.scrollWidth > qualifier.clientWidth,
    };
  });
}

test("a qualifier that fits sits beside the name with the markers after it, and its dot shows a field step after the name and a row step before it", async ({
  mount,
  page,
}) => {
  const component = await mount<typeof TitleQualifierStory>(STORY, { width: WIDTH });
  const first = component.locator('[data-slot="list-row-root"]').nth(0);
  const short = await line(first);
  const [field, row] = await Promise.all([
    resolvedLength(page, `var(${TOKENS["spacing.field"].cssVar})`, first),
    resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`, first),
  ]);
  expect(await first.locator('[data-slot="list-row-title-separator"]').evaluate((dot) => getComputedStyle(dot).visibility)).toBe("visible");
  expect(Math.abs(short.separator.left - short.title.right - field)).toBeLessThanOrEqual(SUBPIXEL);
  expect(Math.abs(short.qualifier.left - short.separator.right - row)).toBeLessThanOrEqual(SUBPIXEL);
  expect(short.qualifier.top).toBeLessThan(short.title.bottom);
  expect(short.markers.top).toBeLessThan(short.title.bottom);
  expect(short.markers.left).toBeGreaterThanOrEqual(short.qualifier.right - SUBPIXEL);
  expect(short.qualifierCut).toBe(false);
});

test("a qualifier too long for the name's line takes the next line and wraps there whole, with the markers after it inside the row", async ({ mount }) => {
  const component = await mount<typeof TitleQualifierStory>(STORY, { width: WIDTH });
  const second = component.locator('[data-slot="list-row-root"]').nth(1);
  const long = await line(second);
  // The dot left on the name's line hides, so no lone dot hangs there.
  await expect(second.locator('[data-slot="list-row-title-separator"]')).toHaveCSS("visibility", "hidden");
  expect(long.qualifier.top).toBeGreaterThanOrEqual(long.title.bottom - SUBPIXEL);
  // The separator stays at the end of the name's line, so the wrapped qualifier opens on its first word.
  expect(long.separator.top).toBeLessThan(long.title.bottom);
  expect(long.qualifier.top).toBeGreaterThanOrEqual(long.separator.bottom - SUBPIXEL);
  expect(long.qualifierCut).toBe(false);
  expect(long.title.right).toBeGreaterThan(long.title.left);
  expect(long.markers.top).toBeGreaterThanOrEqual(long.qualifier.bottom - SUBPIXEL);
  for (const part of [long.qualifier, long.markers]) {
    expect(part.right).toBeLessThanOrEqual(long.root.right + SUBPIXEL);
  }
});

test("two rows told apart only by their qualifier stay apart at 200% text on a phone", async ({ mount, page }) => {
  await page.setViewportSize({ width: PHONE_WIDTH, height: 844 });
  const component = await mount<typeof QualifierPairStory>(PAIR_STORY, { width: PHONE_WIDTH });
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const qualifiers = component.locator('[data-slot="list-row-title-qualifier"]');
  await expect(qualifiers).toHaveCount(2);
  const shown = await qualifiers.evaluateAll((nodes) =>
    nodes.map((node) => {
      const own = node.getBoundingClientRect();
      const row = node.closest('[data-slot="list-row-root"]')?.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
      return {
        text: node.textContent,
        whole: node.scrollWidth <= node.clientWidth && row !== undefined && own.right <= row.right + 1,
        lines: Math.round(own.height / lineHeight),
      };
    }),
  );
  // Each stamp wraps onto the lines it needs and is painted whole, so the minute that differs is on screen.
  expect(shown.filter((qualifier) => !qualifier.whole)).toEqual([]);
  expect(shown.some((qualifier) => qualifier.lines > 1)).toBe(true);
  expect(new Set(shown.map((qualifier) => qualifier.text)).size).toBe(2);
});
