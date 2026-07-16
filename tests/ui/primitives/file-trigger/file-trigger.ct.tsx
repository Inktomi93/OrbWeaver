// CT: the file-trigger headless seal — a caller-rendered trigger element opens a REAL, visually
// hidden <input type="file">, and a picked file reaches onFilesSelected (ui rollup audit C3).
import { expect, test } from "@playwright/experimental-ct-react";
import { FileTriggerHarness } from "./file-trigger.fixtures";

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
