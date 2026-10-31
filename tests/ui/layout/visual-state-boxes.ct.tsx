// D336 step 4d: the focal section, the aria-current box and the tone-stamped divider paint through their own doors.
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MID_GREY } from "../content/theme-scope/contrast-cases.ts";
import type { CurrentBoxesStory, DividerToneStory, FocalSectionStory } from "./_visual-state-boxes-stories.tsx";

const STORIES = "tests/ui/layout/_visual-state-boxes-stories";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;

function style(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate((element, [name, pseudoElement]) => getComputedStyle(element, pseudoElement).getPropertyValue(name), [property, pseudo] as const);
}

const caseOf = (root: Locator, name: string): Locator => root.locator(`[data-case="${name}"]`);
const probeOf = (root: Locator, name: string): Locator => root.locator(`[data-probe="${name}"]`);

for (const { name, ...props } of CASES) {
  test(`${name}: a focal section wears the speaker stripe and glow, an unfocal one is the plain section, and neither changes element`, async ({ mount }) => {
    const root = await mount<typeof FocalSectionStory>(`${STORIES}/FocalSectionStory`, props);
    const focal = caseOf(root, "focal");
    const unfocal = caseOf(root, "unfocal");
    const plain = caseOf(root, "plain");
    expect(await focal.evaluate((element) => element.tagName)).toBe("SECTION");
    expect(await unfocal.evaluate((element) => element.tagName)).toBe("SECTION");
    expect(await style(focal, "border-inline-start-style")).toBe("solid");
    expect(await style(focal, "border-inline-start-width")).not.toBe("0px");
    expect(await style(focal, "border-inline-start-color")).toBe(await style(probeOf(root, "speaker"), "color"));
    expect(await style(focal, "box-shadow", "::before")).not.toBe("none");
    for (const quiet of [unfocal, plain]) {
      expect(await style(quiet, "border-inline-start-width")).toBe("0px");
      expect(await style(quiet, "box-shadow", "::before")).toBe("none");
    }
    expect(await style(unfocal, "padding-inline-start")).toBe(await style(plain, "padding-inline-start"));
  });

  test(`${name}: an aria-current box paints the neutral tint and quiet edge, a resting one draws nothing, and both lay out as their bare twin`, async ({
    mount,
  }) => {
    const root = await mount<typeof CurrentBoxesStory>(`${STORIES}/CurrentBoxesStory`, props);
    const tint = await style(probeOf(root, "tint"), "background-color");
    for (const kind of ["stack", "grid"]) {
      const current = caseOf(root, `${kind}-current`);
      const rest = caseOf(root, `${kind}-rest`);
      expect(await style(current, "background-color"), kind).toBe(tint);
      expect(await style(current, "box-shadow"), kind).not.toBe("none");
      expect(await style(rest, "background-color"), kind).toBe(await style(probeOf(root, "stack"), "background-color"));
      expect(await style(rest, "box-shadow"), kind).toBe("none");
      expect(await style(current, "row-gap"), kind).toBe(await style(rest, "row-gap"));
    }
    const twin = probeOf(root, "stack");
    for (const property of ["display", "flex-direction", "row-gap"]) {
      expect(await style(caseOf(root, "stack-rest"), property), property).toBe(await style(twin, property));
    }
  });

  test(`${name}: a primary and a warning divider paint the stamped tone's solid role, and an unstamped one keeps the border ink`, async ({ mount }) => {
    const root = await mount<typeof DividerToneStory>(`${STORIES}/DividerToneStory`, props);
    for (const [kase, probe] of [
      ["row-primary", "probe-primary"],
      ["stack-warning", "probe-warning"],
    ] as const) {
      expect(await style(caseOf(root, kase), "border-inline-start-width"), kase).toBe("2px");
      expect(await style(caseOf(root, kase), "border-inline-start-color"), kase).toBe(await style(caseOf(root, probe), "border-top-color"));
    }
    expect(await style(caseOf(root, "row-plain"), "border-inline-start-color")).not.toBe(await style(caseOf(root, "probe-primary"), "border-top-color"));
    await expect(caseOf(root, "row-primary")).toHaveAttribute("data-tone", "primary");
    await expect(caseOf(root, "row-plain")).not.toHaveAttribute("data-tone");
  });
}
