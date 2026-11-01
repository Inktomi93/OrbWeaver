// The room's plugin column is a sheet while it is a panel: it slides on `translate`, parks invisible and inert, and casts the
// overlay shadow only while it overlays the transcript. An inline column neither slides nor lifts.

import { keysOf } from "@orb/testkit/iso";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { FlankColumnStory } from "./_flank-column-stories.tsx";

const STORY = "tests/client/features/chat/components/_flank-column-stories/FlankColumnStory";
const THEMES = [undefined, ...keysOf(SEED_THEME_VALUE_SETS)] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const theme of THEMES) {
  const props = theme === undefined ? {} : { theme };
  test.describe(`${theme ?? "hearth"} seed`, () => {
    test("a parked column is hidden, takes no pointer, sits a full width out and paints no lift", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "parked" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toHaveAttribute("data-flank-sheet", "parked");
      expect(await style(column, "visibility")).toBe("hidden");
      expect(await style(column, "pointer-events")).toBe("none");
      expect(await style(column, "translate")).not.toBe("none");
      expect(await style(column, "box-shadow")).toBe("none");
    });

    test("an overlaid column slides in on translate and casts the overlay shadow", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "overlaid" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).toHaveAttribute("data-flank-sheet", "shown");
      await expect(column).toHaveAttribute("data-flank-lifted", "");
      expect(await style(column, "visibility")).toBe("visible");
      expect(await style(column, "transition-property")).toContain("translate");
      expect(await style(column, "translate")).toMatch(/^(none|0px)/u);
      expect(await style(column, "box-shadow")).toBe(await style(root.locator('[data-probe="overlay-shadow"]'), "box-shadow"));
    });

    test("an inline column never slides and casts no lift", async ({ mount }) => {
      const root = await mount<typeof FlankColumnStory>(STORY, { ...props, state: "inline" });
      const column = root.locator('[data-slot="chat-thread-flank"]');
      await expect(column).not.toHaveAttribute("data-flank-lifted");
      expect(await style(column, "box-shadow")).toBe("none");
      expect(await style(column, "visibility")).toBe("visible");
    });
  });
}
