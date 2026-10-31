// A Spoiler is a Stack that blurs its content while concealed; it never paints the box around it.
import { SEED_THEME_VALUE_SETS, TONES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MID_GREY } from "../../content/theme-scope/contrast-cases.ts";
import type { SpoilerStory } from "./_spoiler-stories.tsx";

const STORY = "tests/ui/primitives/spoiler/_spoiler-stories/SpoilerStory";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const { name, ...props } of CASES) {
  test(`${name}: a concealed Spoiler blurs and takes no selection, a revealed one does neither, and both lay out as a Stack`, async ({ mount }) => {
    const component = await mount<typeof SpoilerStory>(STORY, props);
    const concealed = component.locator('[data-case="concealed"]');
    const revealed = component.locator('[data-case="revealed"]');
    await expect(concealed).toHaveAttribute("data-slot", "spoiler");
    await expect(concealed).toHaveAttribute("data-concealed", "");
    await expect(revealed).not.toHaveAttribute("data-concealed");
    expect(await style(concealed, "filter")).toContain("blur");
    expect(await style(concealed, "user-select")).toBe("none");
    expect(await style(revealed, "filter")).toBe("none");
    expect(await style(revealed, "user-select")).not.toBe("none");
    const twin = component.locator('[data-probe="stack"]');
    for (const property of ["display", "flex-direction", "row-gap"]) {
      expect(await style(concealed, property), property).toBe(await style(twin, property));
    }
  });

  test(`${name}: inside a Card of every tone it blurs the content and leaves the card's own paint alone`, async ({ mount }) => {
    const component = await mount<typeof SpoilerStory>(STORY, props);
    for (const tone of TONES) {
      const card = component.locator(`[data-case="card-${tone}"]`);
      const spoiler = component.locator(`[data-case="spoiler-${tone}"]`);
      expect(await style(spoiler, "filter"), tone).toContain("blur");
      expect(await style(card, "filter"), tone).toBe("none");
      expect(await style(card, "user-select"), tone).not.toBe("none");
    }
  });
}
