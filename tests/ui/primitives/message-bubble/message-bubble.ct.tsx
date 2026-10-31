// A MessageBubble paints its role's fill and ink, and takes its box and inset from the shape and the surface's tier.
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MID_GREY } from "../../content/theme-scope/contrast-cases.ts";
import type { MessageBubbleStory } from "./_message-bubble-stories.tsx";

const STORY = "tests/ui/primitives/message-bubble/_message-bubble-stories/MessageBubbleStory";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey scope nested in the light seed", theme: "light" as const, background: MID_GREY },
] as const;

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

for (const { name, ...props } of CASES) {
  test(`${name}: every role paints its fill and ink, with no edge, in each box`, async ({ mount }) => {
    const component = await mount<typeof MessageBubbleStory>(STORY, props);
    for (const role of MESSAGE_ROLES) {
      const row = component.locator(`[data-role-row="${role}"]`);
      const fill = await style(row.locator('[data-probe="fill"]'), "color");
      const ink = await style(row.locator('[data-probe="ink"]'), "color");
      for (const kase of ["bubble", "island", "tier-island", "tier-transcript"]) {
        const bubble = row.locator(`[data-case="${kase}"]`);
        expect(await style(bubble, "background-color"), `${role} ${kase} fill`).toBe(fill);
        expect(await style(bubble, "color"), `${role} ${kase} ink`).toBe(ink);
        expect(await style(bubble, "border-block-start-width"), `${role} ${kase} edge`).toBe("0px");
        await expect(bubble).toHaveAttribute("data-tone", "neutral");
      }
    }
  });

  test(`${name}: the bubble shape is the transcript box and the island resolves its inset and radius from the tier`, async ({ mount }) => {
    const component = await mount<typeof MessageBubbleStory>(STORY, props);
    const probe = (step: string, property: string): Promise<string> => style(component.locator(`[data-probe="${step}"]`).first(), property);
    const radius = "border-start-start-radius";
    for (const role of MESSAGE_ROLES) {
      const row = component.locator(`[data-role-row="${role}"]`);
      const bubble = row.locator('[data-case="bubble"]');
      expect(await style(bubble, radius), `${role} bubble radius`).toBe(await probe("radius.card", radius));
      expect(await style(bubble, "padding-block-start"), `${role} bubble block inset`).toBe(await probe("spacing.row", "padding-block-start"));
      expect(await style(bubble, "padding-inline-start"), `${role} bubble inline inset`).toBe(await probe("spacing.block", "padding-block-start"));
      const island = row.locator('[data-case="island"]');
      expect(await style(island, radius), `${role} island radius`).toBe(await probe("radius.base", radius));
      expect(await style(island, "padding-block-start"), `${role} island inset`).toBe(await probe("spacing.block", "padding-block-start"));
      // Inside an instrument surface the card-root island takes the tier's step; the transcript's own slot stays out of it.
      const tiered = row.locator('[data-case="tier-island"]');
      await expect(tiered).toHaveAttribute("data-slot", "card-root");
      expect(await style(tiered, "padding-block-start"), `${role} tier island inset`).toBe(await probe("spacing.row", "padding-block-start"));
      const transcript = row.locator('[data-case="tier-transcript"]');
      await expect(transcript).toHaveAttribute("data-slot", "message-bubble");
      expect(await style(transcript, "padding-block-start"), `${role} transcript slot inset`).toBe(await probe("spacing.block", "padding-block-start"));
    }
  });
}
