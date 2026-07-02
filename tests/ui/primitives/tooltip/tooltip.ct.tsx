import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@orb/ui/tooltip";
import { expect, test } from "@playwright/experimental-ct-react";

test("shows on hover and hides when the pointer leaves", async ({ mount, page }) => {
  await mount(
    <TooltipProvider delay={0} closeDelay={0}>
      <Tooltip>
        <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
        <TooltipPopup>Regenerate the last reply</TooltipPopup>
      </Tooltip>
    </TooltipProvider>,
  );

  await expect(page.getByText("Regenerate the last reply")).toBeHidden();

  await page.getByRole("button", { name: "Regenerate" }).hover();
  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeVisible();
  // text-label (--text-label: 0.8125rem = 13px) must survive tailwind-merge alongside the
  // text-popover-foreground color (the extended font-size classGroup in variants.ts).
  await expect(popup).toHaveCSS("font-size", "13px");

  await page.mouse.move(600, 400);
  await expect(page.getByText("Regenerate the last reply")).toBeHidden();
});

test("shows on keyboard focus", async ({ mount, page }) => {
  await mount(
    <TooltipProvider delay={0} closeDelay={0}>
      <Tooltip>
        <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
        <TooltipPopup>Regenerate the last reply</TooltipPopup>
      </Tooltip>
    </TooltipProvider>,
  );

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeFocused();
  await expect(page.getByText("Regenerate the last reply")).toBeVisible();
});
