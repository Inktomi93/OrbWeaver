// The room's plugin column is a sheet while it is a panel: it slides on `translate`, parks invisible and inert, and casts the
// overlay shadow only while it overlays the transcript. An in-row panel rests in place, and a column outside panel mode has no sheet at all.

import { computedStyle } from "@orb/testkit/browser/spec";
import { SEED_THEME_NAMES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { FlankColumnStory } from "./_flank-column-stories.tsx";

const STORY = "tests/client/features/chat/components/_flank-column-stories/FlankColumnStory";
const THEMES = [undefined, ...SEED_THEME_NAMES] as const;

for (const theme of THEMES) {
  const props = theme === undefined ? {} : { theme };
  test.describe(`${theme ?? "hearth"} seed`, () => {
    test("a parked column is hidden, takes no pointer, sits a full width out and paints no lift", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "parked" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toHaveAttribute("data-flank-sheet", "parked");
      expect(await computedStyle(column, "visibility")).toBe("hidden");
      expect(await computedStyle(column, "pointer-events")).toBe("none");
      expect(await computedStyle(column, "translate")).not.toBe("none");
      expect(await computedStyle(column, "box-shadow")).toBe("none");
    });

    test("an overlaid column slides in on translate and casts the overlay shadow", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "overlaid" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toHaveAttribute("data-flank-sheet", "shown");
      await expect(column).toHaveAttribute("data-flank-lifted", "");
      expect(await computedStyle(column, "visibility")).toBe("visible");
      expect(await computedStyle(column, "transition-property")).toContain("translate");
      expect(await computedStyle(column, "translate")).toMatch(/^(none|0px)/u);
      expect(await computedStyle(column, "box-shadow")).toBe(await computedStyle(root.locator('[data-probe="overlay-shadow"]'), "box-shadow"));
    });

    test("an open panel in the row rests in place and casts no lift", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "inRowPanel" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toHaveAttribute("data-flank-sheet", "shown");
      await expect(column).not.toHaveAttribute("data-flank-lifted");
      expect(await computedStyle(column, "box-shadow")).toBe("none");
      expect(await computedStyle(column, "visibility")).toBe("visible");
      expect(await computedStyle(column, "translate")).toMatch(/^(none|0px)/u);
    });

    test("a column outside panel mode carries no sheet, so it has no slide to run", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "band" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toBeVisible();
      await expect(column).not.toHaveAttribute("data-flank-sheet");
      await expect(column).not.toHaveAttribute("data-flank-lifted");
      expect(await computedStyle(column, "transition-property")).not.toContain("translate");
      expect(await computedStyle(column, "translate")).toBe("none");
    });
  });
}
