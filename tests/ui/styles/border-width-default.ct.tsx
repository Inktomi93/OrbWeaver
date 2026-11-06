import { LENGTH_BASE_PX } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { BorderWidthDefaultStory } from "./_border-width-default-stories.tsx";

const STORY = "tests/ui/styles/_border-width-default-stories/BorderWidthDefaultStory";
const SHIPPED_DEFAULT_PX = LENGTH_BASE_PX["border-width.default"];
const RETUNED_DEFAULT_PX = SHIPPED_DEFAULT_PX + 2;

const PLAIN_EDGES = [
  ["border", "border-top-width"],
  ["border-s", "border-inline-start-width"],
  ["divide-first", "border-inline-end-width"],
  ["divider", "border-inline-start-width"],
] as const;

test.describe("plain borders and rings resolve through the default border-width step", () => {
  for (const [scope, width] of [
    ["shipped", SHIPPED_DEFAULT_PX],
    ["retuned", RETUNED_DEFAULT_PX],
  ] as const) {
    for (const [probe, property] of PLAIN_EDGES) {
      test(`${probe} is ${String(width)}px under the ${scope} default`, async ({ mount }) => {
        const component = await mount<typeof BorderWidthDefaultStory>(STORY, { retunedPx: RETUNED_DEFAULT_PX });
        await expect(component.locator(`[data-scope="${scope}"] [data-probe="${probe}"]`)).toHaveCSS(property, `${String(width)}px`);
      });
    }

    test(`a plain ring spreads ${String(width)}px under the ${scope} default`, async ({ mount }) => {
      const component = await mount<typeof BorderWidthDefaultStory>(STORY, { retunedPx: RETUNED_DEFAULT_PX });
      const shadow = await component.locator(`[data-scope="${scope}"] [data-probe="ring"]`).evaluate((element) => getComputedStyle(element).boxShadow);
      expect(shadow).toContain(`0px 0px 0px ${String(width)}px`);
    });
  }

  test("a named step does not move with the default", async ({ mount }) => {
    const component = await mount<typeof BorderWidthDefaultStory>(STORY, { retunedPx: RETUNED_DEFAULT_PX });
    for (const scope of ["shipped", "retuned"]) {
      await expect(component.locator(`[data-scope="${scope}"] [data-probe="divider-rule"]`)).toHaveCSS(
        "border-inline-start-width",
        `${String(LENGTH_BASE_PX["border-width.rule"])}px`,
      );
    }
    // A browser snaps a fractional border to the device pixel, so the hairline is compared across the two scopes.
    const hairline = (scope: string): Promise<string> =>
      component.locator(`[data-scope="${scope}"] [data-probe="hairline"]`).evaluate((element) => getComputedStyle(element).borderTopWidth);
    expect(await hairline("retuned")).toBe(await hairline("shipped"));
  });
});
