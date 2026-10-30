// D336 Button tone and ink: a selection-rail row rests neutral and takes the primary rail only when selected, and of the
// fill-less styles only ghost takes its host's ink; an outline draws its own box in its tone's text role.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { HostInkStory, SelectionRailStory } from "./_button-tone-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-tone-stories";

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

test("a resting rail row draws the neutral edge, and the selected row draws the primary rail", async ({ mount }) => {
  const component = await mount<typeof SelectionRailStory>(`${STORIES}/SelectionRailStory`, {});
  const probe = component.locator('[data-probe="neutral-edge"]');
  await component.page().mouse.move(0, 0);
  const resting = component.getByRole("button", { name: "resting row", exact: true });
  const selected = component.getByRole("button", { name: "selected row", exact: true });
  expect(await style(resting, "border-block-start-color")).toBe(await style(probe, "color"));
  expect(await style(selected, "border-inline-start-color")).toBe(await style(component.locator('[data-probe="primary-solid"]'), "color"));
});

test("inside an info soft card a neutral outline paints the neutral text role and a ghost inherits the on-tint ink", async ({ mount }) => {
  const component = await mount<typeof HostInkStory>(`${STORIES}/HostInkStory`, {});
  const probe = component.locator('[data-probe="neutral-text"]');
  await component.page().mouse.move(0, 0);
  const outline = component.getByRole("button", { name: "outline in a card", exact: true });
  const ghost = component.getByRole("button", { name: "ghost in a card", exact: true });
  expect(await style(outline, "color")).toBe(await style(probe, "color"));
  expect(await style(ghost, "color")).toBe(await style(component.locator('[data-probe="info-text-on-tint"]'), "color"));
});
