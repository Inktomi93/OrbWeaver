// A RoomIsland is the card fill and edge at the card radius and the field inset in every tier, a field host and a drop target.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { SEED_CASES } from "../seed-scope-cases.ts";
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

  test(`${name}: a field host lifts on focus, an armed drop target announces itself and a stack lays out in a column`, async ({ mount }) => {
    const component = await mount<typeof RoomIslandStory>(STORY, props);
    const probe = (which: string, property: string): Promise<string> => style(component.locator(`[data-probe="${which}"]`), property);
    const host = component.locator('[data-case="holds-field"]');
    await component.getByLabel("field", { exact: true }).focus();
    await expect.poll(() => style(host, "background-color")).toBe(await probe("muted", "background-color"));
    expect(await style(component.locator('[data-case="drop-armed"]'), "border-block-start-color")).toBe(await probe("primary", "border-block-start-color"));
    const stack = component.locator('[data-case="stack"]');
    expect(await style(stack, "display")).toBe("flex");
    expect(await style(stack, "flex-direction")).toBe("column");
  });
}
