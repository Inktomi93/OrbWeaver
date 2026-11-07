// @subject packages/ui/src/primitives/autocomplete/variants.ts
// The input a finger lands on is as tall as the field's step, not the box inside its border.
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { InlineAutocompleteStory } from "./_touch-floor-stories.tsx";

const STORY = "tests/ui/primitives/autocomplete/_touch-floor-stories/InlineAutocompleteStory";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 740 } });

test("the input is at least the touch-target token tall and the clear button stays centred in the field", async ({ mount, page }) => {
  expect(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["pointer-coarse"])).toBe(true);
  const component = await mount<typeof InlineAutocompleteStory>(STORY);
  const token = await component.locator('[data-probe="touch-target"]').evaluate((node) => node.getBoundingClientRect().height);
  const input = await component.getByRole("combobox", { name: "Find a card", exact: true }).boundingBox();
  expect(input?.height ?? 0).toBeGreaterThanOrEqual(token);
  const centres = await component.locator('[data-slot="autocomplete-input-group"]').evaluate((group) => {
    const middle = (node: Element | null): number => {
      const box = node?.getBoundingClientRect();
      return (box?.top ?? 0) + (box?.height ?? 0) / 2;
    };
    return { group: middle(group), clear: middle(group.querySelector('[data-slot="autocomplete-clear"]')) };
  });
  expect(centres.clear).toBeCloseTo(centres.group, 1);
});
