import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@orb/ui/popover";
import { expect, test } from "@playwright/experimental-ct-react";

test("opens on trigger click and closes on Escape", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
        <PopoverDescription>Everything you need to know.</PopoverDescription>
      </PopoverPopup>
    </Popover>,
  );

  await expect(page.getByText("Details", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Everything you need to know.");

  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
});

test("closes on outside click", async ({ mount, page }) => {
  await mount(
    <Popover>
      <PopoverTrigger>Show details</PopoverTrigger>
      <PopoverPopup>
        <PopoverTitle>Details</PopoverTitle>
      </PopoverPopup>
    </Popover>,
  );

  await page.getByRole("button", { name: "Show details" }).click();
  const popup = page.locator('[data-slot="popover-popup"]');
  await expect(popup).toBeVisible();

  await page.mouse.click(5, 5);
  await expect(popup).toBeHidden();
});
