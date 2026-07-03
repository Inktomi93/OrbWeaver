import { Tooltip, TooltipArrow, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import { expect, test } from "@playwright/experimental-ct-react";
import { TooltipHandleHarness } from "./tooltip-handle.fixtures";

test("shows on hover and hides when the pointer leaves", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
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

test("renders an arrow inside the popup", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>
        <TooltipArrow />
        Regenerate the last reply
      </TooltipPopup>
    </Tooltip>,
  );

  await page.getByRole("button", { name: "Regenerate" }).hover();
  await expect(page.locator('[data-slot="tooltip-arrow"]')).toBeVisible();
});

test("shows on keyboard focus", async ({ mount, page }) => {
  await mount(
    <Tooltip>
      <TooltipTrigger delay={0}>Regenerate</TooltipTrigger>
      <TooltipPopup>Regenerate the last reply</TooltipPopup>
    </Tooltip>,
  );

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Regenerate" })).toBeFocused();
  await expect(page.getByText("Regenerate the last reply")).toBeVisible();
});

// createHandle: opening the tooltip imperatively via the detached handle routes the trigger payload
// to the Root render-function children (harness in ./tooltip-handle.fixtures).
test("opens imperatively via a detached handle and routes the trigger payload to content", async ({
  mount,
  page,
}) => {
  await mount(<TooltipHandleHarness />);

  const popup = page.locator('[data-slot="tooltip-popup"]');
  await expect(popup).toBeHidden();

  await page.getByRole("button", { name: "Open remotely" }).click();
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Reached content");
});
