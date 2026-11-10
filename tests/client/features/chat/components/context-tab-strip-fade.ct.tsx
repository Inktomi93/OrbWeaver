// @subject packages/client/src/features/app-shell/components/context-rail.tsx
// The phone Context sheet's tab strip dissolves a tab cut at its start edge into the sheet's own ground, so no fragment of it reads as a word.
import { contextToggleLabel } from "@orb/client/lib";
import { pixelSpread, seedShellState } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";
import type { ReadingRoom } from "./chat-style-reading.fixtures.ts";
import { createReadingRoom, openReadingStyle, roomStoryProps } from "./chat-style-reading.fixtures.ts";

let root: ReadingRoom["root"];

/** The fade's outermost sliver, where it is almost wholly the ground; the vertical inset skips the strip's rule. */
const FADE_OUTER_EDGE = { x0: 0, x1: 0.08, y0: 0.15, y1: 0.85 } as const;
/** A smooth ground gradient varies a few levels across the sliver; a glyph under it varies by a hundred or more. */
const FADE_EDGE_MAX_SPREAD = 24;

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.beforeAll(async () => {
  ({ root } = await createReadingRoom());
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("a scrolled tab strip fades its cut start tab into the sheet's ground", async ({ corpus, mount, page }) => {
  await openReadingStyle(page, corpus, "flat");
  await seedShellState(page, { activeSection: "chats" });
  await mount<typeof ChatRoomShellStory>("tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory", roomStoryProps());
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const strip = page.locator('[data-slot="context-tab-strip"]').first();
  const tabs = strip.getByRole("tab");
  await expect(tabs.first()).toBeVisible();
  await expect(strip).toHaveAttribute("data-overflow-start", "false");
  // Scroll until the strip's second tab straddles its start edge, the state selecting a far tab leaves.
  await strip.getByRole("tablist").evaluate((list) => {
    const second = list.querySelectorAll('[role="tab"]')[1];
    if (second === undefined) {
      throw new Error("The strip needs a second tab");
    }
    list.scrollLeft += second.getBoundingClientRect().left - list.getBoundingClientRect().left - second.getBoundingClientRect().width / 2;
  });
  await expect(strip).toHaveAttribute("data-overflow-start", "true");
  const fade = strip.locator('[data-slot="context-rail-fade"][data-edge="start"]');
  await expect(fade).toBeVisible();
  const sheetGround = await strip.evaluate((node) => getComputedStyle(node.closest("aside") ?? node).backgroundColor);
  const fadeFrom = await fade.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(fadeFrom).toContain(sheetGround);
  // The fade's outer edge is where the cut tab must be gone. A tab painted over the fade shows its glyphs there.
  const spread = await pixelSpread(page, fade, { region: FADE_OUTER_EDGE });
  expect(spread, "the cut tab shows through the fade's outer edge").toBeLessThanOrEqual(FADE_EDGE_MAX_SPREAD);
});
