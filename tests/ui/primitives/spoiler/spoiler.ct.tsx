// A Spoiler is a Stack that blurs its content while concealed; it never paints the box around it.

import { computedStyle } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import { TONES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { SpoilerStory } from "./_spoiler-stories.tsx";

const STORY = "tests/ui/primitives/spoiler/_spoiler-stories/SpoilerStory";

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: a concealed Spoiler blurs and takes no selection, a revealed one does neither, and both lay out as a Stack`, async ({ mount }) => {
    const component = await mount<typeof SpoilerStory>(STORY, props);
    const concealed = component.locator('[data-case="concealed"]');
    const revealed = component.locator('[data-case="revealed"]');
    await expect(concealed).toHaveAttribute("data-slot", "spoiler");
    await expect(concealed).toHaveAttribute("data-concealed", "");
    await expect(revealed).not.toHaveAttribute("data-concealed");
    expect(await computedStyle(concealed, "filter")).toContain("blur");
    expect(await computedStyle(concealed, "user-select")).toBe("none");
    expect(await computedStyle(revealed, "filter")).toBe("none");
    expect(await computedStyle(revealed, "user-select")).not.toBe("none");
    const twin = component.locator('[data-probe="stack"]');
    for (const property of ["display", "flex-direction", "row-gap"]) {
      expect(await computedStyle(concealed, property), property).toBe(await computedStyle(twin, property));
    }
  });

  test(`${name}: inside a Card of every tone it blurs the content and leaves the card's own paint alone`, async ({ mount }) => {
    const component = await mount<typeof SpoilerStory>(STORY, props);
    for (const tone of TONES) {
      const card = component.locator(`[data-case="card-${tone}"]`);
      const spoiler = component.locator(`[data-case="spoiler-${tone}"]`);
      expect(await computedStyle(spoiler, "filter"), tone).toContain("blur");
      expect(await computedStyle(card, "filter"), tone).toBe("none");
      expect(await computedStyle(card, "user-select"), tone).not.toBe("none");
    }
  });
}
