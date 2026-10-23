import { expect, test } from "@playwright/test";
import type { TooltipDescriptionStory, TooltipHandleStory } from "./_native-parts-stories.tsx";

test("native arrow and viewport do not duplicate portal parts into the at-rest accessible description", async ({ mount, page }) => {
  await mount<typeof TooltipDescriptionStory>("tests/ui/primitives/tooltip/_native-parts-stories/TooltipDescriptionStory");
  const trigger = page.getByRole("button", { name: "Regenerate", exact: true });
  const popup = page.locator('[data-slot="tooltip-popup"]');
  const description = page.getByRole("tooltip");
  await expect(popup).toBeHidden();
  await expect(trigger).toHaveAccessibleDescription("Regenerate the last reply Also mentioned elsewhere");
  await expect(description).toHaveCount(1);
  await expect(description).toHaveText("Regenerate the last reply");
  await expect(description.locator('[data-slot="tooltip-arrow"], [data-slot="tooltip-viewport"]')).toHaveCount(0);
  await trigger.hover();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveAttribute("aria-hidden", "true");
  await expect(popup.locator('[data-slot="tooltip-viewport"]')).toHaveText("Regenerate the last reply");
  await expect(popup.locator('[data-slot="tooltip-arrow"]')).toBeVisible();
  await expect(description).toHaveCount(1);
  await page.getByRole("button", { name: "Outside tooltip", exact: true }).hover();
  await expect(popup).toBeHidden();
  await expect(trigger).toHaveAccessibleDescription("Regenerate the last reply Also mentioned elsewhere");
});

test("a tooltip handle opens its anchor payload and switches to another detached trigger", async ({ mount, page }) => {
  await mount<typeof TooltipHandleStory>("tests/ui/primitives/tooltip/_native-parts-stories/TooltipHandleStory");
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeHidden();
  await page.getByRole("button", { name: "Open remotely", exact: true }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveText("Character details");
  await page.getByRole("button", { name: "Close remotely", exact: true }).click();
  await expect(popup).toBeHidden();
  await page.getByRole("button", { name: "Rooms", exact: true }).hover();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveText("Room details");
});
