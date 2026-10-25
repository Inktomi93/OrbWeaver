// The header's three icon-only controls carry their name in aria-label and the same text in a tooltip, never a native title.
import { expect, test } from "@playwright/test";
import type { ImmersiveCardChromeStory } from "./_card-stories.tsx";

test("each icon-only control opens its tooltip on hover and keeps its accessible name", async ({ mount, page }) => {
  await mount<typeof ImmersiveCardChromeStory>("tests/ui/content/immersive-card/_card-stories/ImmersiveCardChromeStory", {});
  const popup = page.locator('[data-slot="tooltip-popup"]');
  for (const name of ["View raw source", "Open card fullscreen", "Collapse card"]) {
    const control = page.getByRole("button", { name, exact: true });
    await expect(control).not.toHaveAttribute("title");
    await control.hover();
    await expect(popup).toHaveAttribute("data-open", "");
    await expect(popup).toHaveText(name);
    await page.mouse.move(0, 0);
    await expect(popup).toBeHidden();
  }
});
