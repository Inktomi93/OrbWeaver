// The corner close of a dialog: where it sits in the popup, what it leaves the title, and that it closes.
import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { FormDialogCloseStory } from "./_form-dialog-stories.tsx";

test.use({ viewport: { width: 1024, height: 768 } });

test("the close sits one field step in from the popup's corner, the title clears it, and a click closes", async ({ mount, page }) => {
  await mount<typeof FormDialogCloseStory>("tests/client/components/_form-dialog-stories/FormDialogCloseStory", {});
  const dialog = page.getByRole("dialog", { name: "Closable form", exact: true });
  await expect(dialog).toBeVisible();
  // The popup scales in, and a box read mid-animation is the wrong size.
  await dialog.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  const [popup, button, title] = await Promise.all([dialog.boundingBox(), close.boundingBox(), dialog.getByRole("heading").boundingBox()]);
  const field = await resolvedLength(page, `var(${TOKENS["spacing.field"].cssVar})`, dialog);
  const edge = await resolvedLength(page, `var(${TOKENS["border-width.control"].cssVar})`, dialog);
  const control = await resolvedLength(page, `var(${TOKENS["size.control-md"].cssVar})`, dialog);
  if (popup === null || button === null || title === null) {
    throw new Error("The dialog's parts have no box");
  }
  expect(button.y - popup.y).toBeCloseTo(field + edge, 0);
  expect(popup.x + popup.width - button.x - button.width).toBeCloseTo(field + edge, 0);
  expect(button.width).toBeCloseTo(control, 0);
  expect(button.height).toBeCloseTo(control, 0);
  expect(title.width).toBeGreaterThan(0);
  await close.click();
  await expect(dialog).toHaveCount(0);
});
