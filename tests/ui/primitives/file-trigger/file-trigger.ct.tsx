// CT: the file-trigger headless seal — a caller-rendered trigger element opens a REAL, visually
// hidden <input type="file">, and a picked file reaches onFilesSelected (ui rollup audit C3).
import { expect, test } from "@playwright/experimental-ct-react";
import { FileTriggerHarness } from "./file-trigger.fixtures.tsx";

test("clicking the caller's trigger opens the native file picker and a selection reaches onFilesSelected", async ({ mount, page }) => {
  await mount(<FileTriggerHarness />);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Replace portrait" }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: Buffer.from("hi"),
    mimeType: "image/png",
    name: "portrait.png",
  });
  await expect(page.getByTestId("picked-names")).toContainText("portrait.png");
});

test("the underlying input carries type=file and stays out of the tab order (the caller's trigger is the focus stop)", async ({ mount, page }) => {
  await mount(<FileTriggerHarness />);
  const input = page.locator('[data-slot="file-trigger-input"]');
  await expect(input).toHaveAttribute("type", "file");
  await expect(input).toHaveAttribute("tabindex", "-1");
});

// Finding #5 (2026-07-25 a11y sweep): the hidden input is a pure MECHANISM (fired only via open()), so it
// is aria-hidden — its native "Choose File" affordance must NOT announce as a second, unlabeled control
// beside the caller's real, labeled trigger. Only ONE file-picker control is in the a11y tree.
test("the underlying input is aria-hidden — no duplicate unlabeled 'Choose File' control in the a11y tree", async ({ mount, page }) => {
  await mount(<FileTriggerHarness />);
  await expect(page.locator('[data-slot="file-trigger-input"]')).toHaveAttribute("aria-hidden", "true");
  // The caller's trigger is the ONE operable control; the raw file input is not exposed as a second button.
  await expect(page.getByRole("button", { name: "Replace portrait" })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(1);
});

test("disabled: the input is disabled and clicking the trigger does not open a picker", async ({ mount, page }) => {
  await mount(<FileTriggerHarness disabled={true} />);
  await expect(page.locator('[data-slot="file-trigger-input"]')).toBeDisabled();
  const fileChooserRace = Promise.race([
    page.waitForEvent("filechooser").then(() => "opened"),
    page
      .getByRole("button", { name: "Replace portrait" })
      .click()
      .then(() => "clicked"),
  ]);
  await expect(fileChooserRace).resolves.toBe("clicked");
});
