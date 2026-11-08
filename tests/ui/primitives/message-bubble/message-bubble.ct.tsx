// A MessageBubble paints its role's fill and ink, and takes its box and inset from the shape and the surface's tier.
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { computedStyle } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { MessageBubbleStory } from "./_message-bubble-stories.tsx";

const STORY = "tests/ui/primitives/message-bubble/_message-bubble-stories/MessageBubbleStory";

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: every role paints its fill and ink, with no edge, in each box`, async ({ mount }) => {
    const component = await mount<typeof MessageBubbleStory>(STORY, props);
    for (const role of MESSAGE_ROLES) {
      const row = component.locator(`[data-role-row="${role}"]`);
      const fill = await computedStyle(row.locator('[data-probe="fill"]'), "color");
      const ink = await computedStyle(row.locator('[data-probe="ink"]'), "color");
      for (const kase of ["bubble", "island", "tier-island", "tier-transcript"]) {
        const bubble = row.locator(`[data-case="${kase}"]`);
        expect(await computedStyle(bubble, "background-color"), `${role} ${kase} fill`).toBe(fill);
        expect(await computedStyle(bubble, "color"), `${role} ${kase} ink`).toBe(ink);
        expect(await computedStyle(bubble, "border-block-start-width"), `${role} ${kase} edge`).toBe("0px");
        await expect(bubble).toHaveAttribute("data-tone", "neutral");
      }
    }
  });

  test(`${name}: the bubble shape is the transcript box and the island resolves its inset and radius from the tier`, async ({ mount }) => {
    const component = await mount<typeof MessageBubbleStory>(STORY, props);
    const probe = (step: string, property: string): Promise<string> => computedStyle(component.locator(`[data-probe="${step}"]`).first(), property);
    const radius = "border-start-start-radius";
    for (const role of MESSAGE_ROLES) {
      const row = component.locator(`[data-role-row="${role}"]`);
      const bubble = row.locator('[data-case="bubble"]');
      expect(await computedStyle(bubble, radius), `${role} bubble radius`).toBe(await probe("radius.card", radius));
      expect(await computedStyle(bubble, "padding-block-start"), `${role} bubble block inset`).toBe(await probe("spacing.row", "padding-block-start"));
      expect(await computedStyle(bubble, "padding-inline-start"), `${role} bubble inline inset`).toBe(await probe("spacing.block", "padding-block-start"));
      const island = row.locator('[data-case="island"]');
      expect(await computedStyle(island, radius), `${role} island radius`).toBe(await probe("radius.base", radius));
      expect(await computedStyle(island, "padding-block-start"), `${role} island inset`).toBe(await probe("spacing.block", "padding-block-start"));
      // Inside an instrument surface the card-root island takes the tier's step; the transcript's own slot stays out of it.
      const tiered = row.locator('[data-case="tier-island"]');
      await expect(tiered).toHaveAttribute("data-slot", "card-root");
      expect(await computedStyle(tiered, "padding-block-start"), `${role} tier island inset`).toBe(await probe("spacing.row", "padding-block-start"));
      const transcript = row.locator('[data-case="tier-transcript"]');
      await expect(transcript).toHaveAttribute("data-slot", "message-bubble");
      expect(await computedStyle(transcript, "padding-block-start"), `${role} transcript slot inset`).toBe(await probe("spacing.block", "padding-block-start"));
    }
  });
}
