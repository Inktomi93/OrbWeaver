// @subject packages/client/src/features/app-shell/components/context-rail.tsx
// Layer: CT. Production entry: the chat room shell's phone Context sheet, mounted over the corpus room.
// A context tab strip that scrolls shows its overflow with a fade and a chevron at the cut edge. No tab label may show through that mark, and the mark
// belongs to the scroll port: it never lies over the overflow control beside the strip.
import { contextToggleLabel } from "@orb/client/lib";
import { pixelSpread, resolvedLength, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const MARK = '[data-slot="context-rail-fade"]';
const MARK_GLYPH = '[data-slot="context-rail-more"]';
const EDGES = ["start", "end"] as const;
/** The mark's ground is one opaque fill, so a clean read varies by dithering alone; a glyph under it varies by a hundred or more. */
const FLAT_GROUND_MAX_SPREAD = 4;
/** The mark's vertical inset, which skips the strip's own rule. */
const MARK_ROWS = { y0: 0.15, y1: 0.85 } as const;

let root: ReadingRoom["root"];

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  ({ root } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

/** Scroll offsets that park each tab half under the start mark and half under the end mark, in the strip's interior, where both edges hide content. */
function interiorStops(list: HTMLElement, gutter: number): readonly number[] {
  const reach = list.scrollWidth - list.clientWidth;
  const origin = list.getBoundingClientRect().left - list.scrollLeft;
  const stops = [...list.querySelectorAll('[role="tab"]')].flatMap((tab) => {
    const box = tab.getBoundingClientRect();
    return [box.left - origin - gutter / 2, box.right - origin - list.clientWidth + gutter / 2];
  });
  return [...new Set(stops.map(Math.round))].filter((left) => left > gutter && left < reach - gutter);
}

/** How many tabs overlap the mark's box. */
async function tabsUnder(strip: Locator, markBox: { readonly x: number; readonly width: number }): Promise<number> {
  const boxes = await Promise.all((await strip.getByRole("tab").all()).map((tab) => tab.boundingBox()));
  return boxes.filter((box) => box !== null && box.x < markBox.x + markBox.width && box.x + box.width > markBox.x).length;
}

/** Judges one mark at the strip's current scroll: nothing reads through it and it keeps clear of the overflow control. Returns the tabs under it. */
async function judgeMark(page: Page, strip: Locator, edge: (typeof EDGES)[number], left: number): Promise<number> {
  const mark = strip.locator(`${MARK}[data-edge="${edge}"]`);
  await expect(mark).toBeVisible();
  const glyph = mark.locator(MARK_GLYPH);
  // The glyph is the mark's own ink: hide it so the read judges only what lies under it.
  await glyph.evaluate((node) => {
    node.style.visibility = "hidden";
  });
  const trigger = strip.locator('[data-slot="context-tab-overflow-trigger"]');
  const [markBox, glyphBox, triggerBox] = await Promise.all([mark.boundingBox(), glyph.boundingBox(), trigger.boundingBox()]);
  if (markBox === null || glyphBox === null || triggerBox === null) {
    throw new Error("The mark, its glyph and the overflow control must render");
  }
  // From the strip's outer edge across the glyph: the part of the mark a label could read through.
  const across =
    edge === "start" ? { x0: 0, x1: (glyphBox.x + glyphBox.width - markBox.x) / markBox.width } : { x0: (glyphBox.x - markBox.x) / markBox.width, x1: 1 };
  const spread = await pixelSpread(page, mark, { region: { ...across, ...MARK_ROWS } });
  expect(spread, `a tab label shows through the ${edge} mark at scroll ${String(left)}`).toBeLessThanOrEqual(FLAT_GROUND_MAX_SPREAD);
  const overlap = Math.min(markBox.x + markBox.width, triggerBox.x + triggerBox.width) - Math.max(markBox.x, triggerBox.x);
  expect(Math.max(0, overlap), `the ${edge} mark lies over the overflow control`).toBeLessThanOrEqual(1);
  return await tabsUnder(strip, markBox);
}

test("no tab label shows through a scroll mark, and the marks stay off the overflow control", async ({ corpus, mount, page }) => {
  await openReadingStyle(page, corpus, "flat");
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof ChatRoomShellStory>(STORY, roomStoryProps());
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const strip = page.locator('[data-slot="context-tab-strip"]').first();
  const list = strip.getByRole("tablist");
  await expect(strip.locator('[data-slot="context-tab-overflow-trigger"]')).toBeVisible();
  const gutter = await resolvedLength(page, `var(${TOKENS["spacing.gutter"].cssVar})`, strip);
  const stops = await list.evaluate(interiorStops, gutter);
  expect(stops.length, "the strip has interior stops to judge").toBeGreaterThan(0);
  let tabsUnderMarks = 0;
  for (const left of stops) {
    await list.evaluate((node, offset) => {
      node.scrollLeft = offset;
    }, left);
    for (const edge of EDGES) {
      tabsUnderMarks += await judgeMark(page, strip, edge, left);
    }
  }
  expect(tabsUnderMarks, "the stops put tabs under the marks, so the reads have a label to catch").toBeGreaterThan(0);
});
