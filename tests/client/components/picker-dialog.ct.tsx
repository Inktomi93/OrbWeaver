import { PickerDialog } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { expect, test } from "@playwright/experimental-ct-react";

test("keeps the heading at the viewport gutter and dismisses with Escape", async ({ mount, page }) => {
  await mount(
    <CtIsolation subject="PickerDialog" isolates="isolates dialog placement and keyboard dismissal from authenticated feature data">
      <PickerDialog defaultOpen={true} title="Pick an image">
        <input aria-label="Find images" />
        <button type="button">Choose image</button>
      </PickerDialog>
    </CtIsolation>,
  );
  const dialog = page.getByRole("dialog", { name: "Pick an image", exact: true });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const viewport = element.parentElement;
        return viewport === null ? Number.NaN : Math.abs(element.getBoundingClientRect().y - Number.parseFloat(getComputedStyle(viewport).paddingTop));
      }),
    )
    .toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
