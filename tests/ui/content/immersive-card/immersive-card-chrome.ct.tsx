// The header's three icon-only controls carry their name in aria-label and the same text in a tooltip, never a native title.
import { expect, test } from "@playwright/test";
import { IMMERSIVE_CARD_LABELS } from "../../../../packages/ui/src/content/immersive-card/control-labels.ts";
import type { ImmersiveCardChromeStory } from "./_card-stories.tsx";

test("each icon-only control opens its tooltip on hover and keeps its accessible name", async ({ mount, page }) => {
  await mount<typeof ImmersiveCardChromeStory>("tests/ui/content/immersive-card/_card-stories/ImmersiveCardChromeStory", {});
  const popup = page.locator('[data-slot="tooltip-popup"]');
  for (const name of [IMMERSIVE_CARD_LABELS.rawSource, IMMERSIVE_CARD_LABELS.fullscreen, IMMERSIVE_CARD_LABELS.collapse]) {
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).not.toHaveAttribute("title");
    await control.hover();
    await expect(popup).toHaveAttribute("data-open", "");
    // The tooltip repeats the name the control was found by.
    await expect(popup).toHaveText(name);
    await page.mouse.move(0, 0);
    await expect(popup).toBeHidden();
  }
});
