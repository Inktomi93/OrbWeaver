// A RoomIsland is the card fill and edge at the card radius and the field inset in every tier, a field host and a drop target.

import { SEED_CASES } from "@orb/testkit/iso";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { RoomIslandStory } from "./_room-island-stories.tsx";

const STORY = "tests/ui/primitives/room-island/_room-island-stories/RoomIslandStory";

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: the island paints the card fill and edge at the card radius and field inset, in and out of a tier`, async ({ mount }) => {
    const component = await mount<typeof RoomIslandStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => style(component.locator(`[data-probe="${which}"]`), property);
    for (const kase of ["island", "tier-island"]) {
      const island = component.locator(`[data-case="${kase}"]`);
      await expect(island).toHaveAttribute("data-slot", "test-island");
      await expect(island).toHaveAttribute("data-tone", "neutral");
      expect(await style(island, "background-color"), kase).toBe(await probe("card", "background-color"));
      expect(await style(island, "border-block-start-color"), kase).toBe(await probe("edge", "border-block-start-color"));
      expect(await style(island, "border-start-start-radius"), kase).toBe(await probe("island", "border-start-start-radius"));
      expect(await style(island, "padding-block-start"), kase).toBe(await probe("island", "padding-block-start"));
    }
  });

  test(`${name}: hover alone moves a field host's edge to the ring colour and adds no focus ring`, async ({ mount, page }) => {
    // A coarse pointer has no hover, and the hover variant is gated on it.
    test.skip(!(await page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["hover-capable"])), "no hover on a coarse pointer");
    const component = await mount<typeof RoomIslandStory>(STORY, props);
    const host = component.locator('[data-case="holds-field"]');
    await host.hover();
    await expect.poll(() => style(host, "border-block-start-color")).toBe(await style(component.locator('[data-probe="ring"]'), "border-block-start-color"));
    expect(await style(host, "box-shadow")).toBe("none");
  });

  test(`${name}: a field host lifts on focus, an armed drop target announces itself and a stack lays out in a column`, async ({ mount, page }) => {
    const component = await mount<typeof RoomIslandStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => style(component.locator(`[data-probe="${which}"]`), property);
    const host = component.locator('[data-case="holds-field"]');
    // A card that holds a field is the field's edge, so it wears the form-control edge token whose 3:1 floor D159 pins.
    expect(await style(host, "border-block-start-color")).toBe(await probe("input-edge", "border-block-start-color"));
    expect(await style(host, "box-shadow")).toBe("none");
    // Focus wins over hover: a hovered, focused host still wears the focus ring, and focus alone matches it.
    await host.hover();
    await component.getByLabel("field", { exact: true }).focus();
    await expect.poll(() => style(host, "background-color")).toBe(await probe("muted", "background-color"));
    await expect.poll(() => style(host, "box-shadow")).not.toBe("none");
    const hoveredFocus = await style(host, "box-shadow");
    await page.mouse.move(0, 0);
    await expect.poll(() => style(host, "border-block-start-color")).toBe(await probe("ring", "border-block-start-color"));
    expect(await style(host, "box-shadow")).toBe(hoveredFocus);
    expect(await style(component.locator('[data-case="drop-armed"]'), "border-block-start-color")).toBe(await probe("primary", "border-block-start-color"));
    const stack = component.locator('[data-case="stack"]');
    expect(await style(stack, "display")).toBe("flex");
    expect(await style(stack, "flex-direction")).toBe("column");
  });
}
