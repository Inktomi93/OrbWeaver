import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { ToastPlayground } from "./toast.fixtures.tsx";

test("a toast appears via the imperative add API", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Saved");
  await expect(toast).toContainText("All changes stored.");
});

test("a loading toast carries data-type=loading and the distinct primary border", async ({ mount, page }) => {
  await mount(<ToastPlayground />);
  await page.getByRole("button", { name: "add loading toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  // Base UI sets data-type from the toast type; the seal tints the loading border with the primary
  // accent so it reads distinctly from a plain toast (bg-popover border).
  await expect(toast).toHaveAttribute("data-type", "loading");
  await expect(toast).toHaveCSS("border-top-color", TOKENS["color.primary"].value);
});

test("toasts stack and can be dismissed via the close button", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  const addButton = page.getByRole("button", { name: "add toast", exact: true });
  await addButton.click();
  await addButton.click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(2);

  const closeButtons = page.locator('[data-slot="toast-root"] button[aria-label="Close notification"]');
  await expect(closeButtons).toHaveCount(2);
  await expect(closeButtons.first()).toBeVisible();
  await closeButtons.first().click();
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(1);
});

test("a toast carries a native action button that is clickable", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add toast with action", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);

  // The native Toast.Action renders the label from actionProps.children (not a hand-rolled button).
  const action = toast.locator('[data-slot="toast-action"]');
  await expect(action).toHaveText("Open character");

  // Clicking the action fires its onClick — here it enqueues a second toast, proving the handler ran.
  await action.click();
  await expect(page.locator('[data-slot="toast-root"]')).toContainText(["Opened", "Character created"]);
});

test("a toast auto-dismisses after its timeout", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add quick toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);
  // 500ms timeout — expect polling (never manual sleeps) sees it removed.
  await expect(toast).toHaveCount(0);
});

// Base UI's default swipeDirection is ['down', 'right'] with a 40px dismiss threshold. This drags
// PAST that threshold and asserts BOTH halves of the fix: `data-swiping` is present mid-drag (so
// `data-swiping:transition-none` can suspend the enter/exit transition and the gesture tracks 1:1 —
// the defect this fix closes, mirroring drawer's popup) and the toast is actually dismissed on release.
test("a toast can be swiped away past the dismiss threshold", async ({ mount, page }) => {
  await mount(<ToastPlayground />);

  await page.getByRole("button", { name: "add toast", exact: true }).click();
  const toast = page.locator('[data-slot="toast-root"]');
  await expect(toast).toHaveCount(1);

  const box = await toast.boundingBox();
  if (box === null) {
    throw new Error("toast CT: missing bounding box for swipe geometry");
  }
  // Start the drag over the title/description area (avoids the close button and action, which are
  // in the swipe-gesture ignore-selector) and drag DOWN well past the 40px threshold.
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 3;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 30, { steps: 5 });
  await expect(toast).toHaveAttribute("data-swiping");
  await page.mouse.move(startX, startY + 80, { steps: 5 });
  await page.mouse.up();

  await expect(toast).toHaveCount(0);
});
