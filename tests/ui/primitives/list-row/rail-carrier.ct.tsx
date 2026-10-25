// `rowTint="row"` moves the selection rail from the body to the root: the body's rail reset and the root's rail are
// spelled in different class vocabularies, and the merger must resolve them or the body draws a second rail.
import { expect, test } from "@playwright/test";
import type { FullTitleStory, RowTintStory } from "./_rail-stories.tsx";

const STORY = "tests/ui/primitives/list-row/_rail-stories/RowTintStory";

test("the body carries no rail when the row wears the tint, at rest and selected", async ({ mount }) => {
  const component = await mount<typeof RowTintStory>(STORY, {});
  const roots = component.locator('[data-slot="list-row-root"]');
  const bodies = component.locator('[data-slot="list-row-body"]');
  await expect(bodies).toHaveCount(3);
  const railOf = (index: number, slot: typeof roots): Promise<string> => slot.nth(index).evaluate((element) => getComputedStyle(element).borderLeftWidth);
  expect(await railOf(0, bodies)).toBe("0px");
  expect(await railOf(1, bodies)).toBe("0px");
  expect(await railOf(0, roots)).toBe("2px");
  expect(await railOf(1, roots)).toBe("2px");
  // The default arm keeps the rail on the body, which is what the row arm resets.
  expect(await railOf(2, bodies)).toBe("2px");
  expect(await railOf(2, roots)).toBe("0px");
});

test("the full title opens as a tooltip on hover and is the row's hidden description", async ({ mount, page }) => {
  await mount<typeof FullTitleStory>("tests/ui/primitives/list-row/_rail-stories/FullTitleStory", {});
  const popup = page.locator('[data-slot="tooltip-popup"]');
  const description = page.locator('[data-slot="list-row-full-title"]');
  await expect(popup).toBeHidden();
  await expect(page.getByRole("button", { name: "Main", exact: true })).toHaveAccessibleDescription("Main system instruction");
  await expect(description).toHaveText("Main system instruction");
  await page.locator('[data-slot="list-row-title"]').hover();
  await expect(popup).toHaveAttribute("data-open", "");
  await expect(popup).toHaveAttribute("aria-hidden", "true");
});
