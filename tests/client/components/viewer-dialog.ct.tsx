import { ViewerDialog } from "@orb/client/components";
import { expect, test } from "@playwright/experimental-ct-react";

test("names the viewer, traps keyboard focus and dismisses through the native close", async ({ mount, page }) => {
  await mount(
    <ViewerDialog defaultOpen={true} title="Recorded content">
      <button type="button">Copy content</button>
    </ViewerDialog>,
  );
  const dialog = page.getByRole("dialog", { name: "Recorded content", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});
