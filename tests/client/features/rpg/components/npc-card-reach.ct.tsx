// @subject packages/client/src/features/rpg/components/tracker-blocks/npc-card-slots.tsx
// A present-character card keeps its mood inside the card at enlarged text on a phone: the mood takes its own width and wraps, never clipped past the card's edge.

import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { NpcCardStory } from "./_npc-card-stories.tsx";

const STORY = "tests/client/features/rpg/components/_npc-card-stories/NpcCardStory";
const NAME = "Alderic";
const MOOD = "quietly furious and trying very hard not to show it";
const PHONE_WIDTHS = [320, 390] as const;
const FONT_SCALES = [2, 3] as const;
// Rounding of two fractional boxes.
const EDGE_SLACK = 0.5;

test.use({ hasTouch: true, isMobile: true });

for (const width of PHONE_WIDTHS) {
  for (const factor of FONT_SCALES) {
    test(`at ${String(width)} and ${String(factor * 100)}% text the mood stays inside the card, whole`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 844 });
      await mount<typeof NpcCardStory>(STORY, { name: NAME, mood: MOOD });
      await setRootFontScale(page, channelName("fontScale"), factor);
      await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThanOrEqual(16 * factor);
      const mood = page.getByRole("button", { name: `${NAME} mood: ${MOOD}`, exact: true });
      await expect(mood).toBeVisible();
      const clipped = await mood.evaluate((button, slack) => {
        const card = button.closest('[data-slot="npc-card"]');
        if (card === null) {
          return ["the mood is outside its card"];
        }
        const edge = card.getBoundingClientRect().right;
        const found: string[] = [];
        // The mood's own row and the button inside it: nothing paints past the card, and no box in the chain hides part of its words.
        for (let node: Element | null = button; node !== null && node !== card; node = node.parentElement) {
          if (node.getBoundingClientRect().right > edge + slack) {
            found.push(`${node.tagName.toLowerCase()} runs past the card`);
          }
          if (node.scrollWidth > node.clientWidth + slack) {
            found.push(`${node.tagName.toLowerCase()} holds ${String(node.scrollWidth)}px in ${String(node.clientWidth)}px`);
          }
        }
        return found;
      }, EDGE_SLACK);
      expect(clipped).toEqual([]);
    });
  }
}
