import { expect, test } from "@playwright/experimental-ct-react";
import { ToastPlayground } from "./toast-fixture";

test("a toast appears via the imperative add API", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Saved");
  await expect(toast).toContainText("All changes stored.");
});

test("toasts stack and can be dismissed via the close button", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  const addButton = page.getByRole("button", { name: "add toast", exact: true });
  await addButton.click();
  await addButton.click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);

  const closeButtons = page.locator(
    '[data-slot="toast-root"] button[aria-label="Close notification"]',
  );
  await expect(closeButtons).toHaveCount(2);
  await expect(closeButtons.first()).toBeVisible();
  await closeButtons.first().click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
});

test("a toast auto-dismisses after its timeout", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add quick toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  // 500ms timeout — expect polling (never manual sleeps) sees it removed.
  await expect(toast).toHaveCount(0);
});
