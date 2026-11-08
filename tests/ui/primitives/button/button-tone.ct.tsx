// D336 Button tone and ink: a selection-rail row rests neutral and takes the primary rail only when selected, and of the
// fill-less styles only ghost takes its host's ink; an outline draws its own box in its tone's text role.

import { computedStyle } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { HostInkStory, SelectionRailStory } from "./_button-tone-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-tone-stories";

test("a resting rail row draws the neutral edge, and the selected row draws the primary rail", async ({ mount }) => {
  const component = await mount<typeof SelectionRailStory>(`${STORIES}/SelectionRailStory`, {});
  const probe = component.locator('[data-probe="neutral-edge"]');
  await component.page().mouse.move(0, 0);
  const resting = component.getByRole("button", { name: "resting row", exact: true });
  const selected = component.getByRole("button", { name: "selected row", exact: true });
  expect(await computedStyle(resting, "border-block-start-color")).toBe(await computedStyle(probe, "color"));
  expect(await computedStyle(selected, "border-inline-start-color")).toBe(await computedStyle(component.locator('[data-probe="primary-solid"]'), "color"));
});

test("inside an info soft card a neutral outline paints the neutral text role and a ghost inherits the on-tint ink", async ({ mount }) => {
  const component = await mount<typeof HostInkStory>(`${STORIES}/HostInkStory`, {});
  const probe = component.locator('[data-probe="neutral-text"]');
  await component.page().mouse.move(0, 0);
  const outline = component.getByRole("button", { name: "outline in a card", exact: true });
  const ghost = component.getByRole("button", { name: "ghost in a card", exact: true });
  expect(await computedStyle(outline, "color")).toBe(await computedStyle(probe, "color"));
  expect(await computedStyle(ghost, "color")).toBe(await computedStyle(component.locator('[data-probe="info-text-on-tint"]'), "color"));
});
