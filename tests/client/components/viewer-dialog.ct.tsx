import { ViewerDialog } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { expect, test } from "@playwright/experimental-ct-react";

test("names the viewer, traps keyboard focus and dismisses through the native close", async ({ mount, page }) => {
  await mount(
    <CtIsolation subject="ViewerDialog" isolates="isolates dialog focus containment from authenticated feature data">
      <ViewerDialog defaultOpen={true} title="Recorded content">
        <button type="button">Copy content</button>
      </ViewerDialog>
    </CtIsolation>,
  );
  const dialog = page.getByRole("dialog", { name: "Recorded content", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
});
