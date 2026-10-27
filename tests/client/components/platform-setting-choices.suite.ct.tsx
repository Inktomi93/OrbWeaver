import { touchTargetFindings } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { SettingChoicesStory } from "./_setting-choices-stories.tsx";

for (const regime of [
  { label: "desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false },
  { label: "phone", width: 342, viewport: { width: 390, height: 844 }, coarse: true },
] as const) {
  test.describe(regime.label, () => {
    test.use({ hasTouch: regime.coarse, isMobile: regime.coarse, viewport: regime.viewport });

    test("inline choices contain rich Field states without losing identity, hints or selection targets", async ({ mount, page }) => {
      const mounted = await mount<typeof SettingChoicesStory>("tests/client/components/_setting-choices-stories/SettingChoicesStory", { width: regime.width });
      const archive = page.getByRole("checkbox", { name: "Archive entries", exact: true });
      const images = page.getByRole("checkbox", { name: "Images", exact: true });
      const chats = page.getByRole("checkbox", { name: "Plain selection", exact: true });
      await expect(archive).toHaveAccessibleDescription("Keep the source entries alongside their extracted text in this archive.");
      await expect(images).toBeEnabled();
      await expect(chats).toBeChecked();
      const archiveLabel = page.getByText("Archive entries", { exact: true });
      if (regime.coarse) {
        await archiveLabel.tap();
      } else {
        await archiveLabel.click();
      }
      await expect(archive).not.toBeChecked();
      await archive.focus();
      await page.keyboard.press("Space");
      await expect(archive).toBeChecked();
      const field = page.locator('[data-slot="field-root"]').filter({ has: archive });
      const label = field.locator('[data-slot="field-label"]');
      const group = page.locator('[data-slot="setting-row-group"]');
      const hint = page.getByRole("button", { name: "More info about Archive entries", exact: true });
      const description = field.locator('[data-slot="field-description"]');
      const initial = await Promise.all([label.boundingBox(), archive.boundingBox(), hint.boundingBox(), description.boundingBox(), group.boundingBox()]);
      const [initialLabel, initialControl, hintBox, descriptionBox, initialGroup] = initial;
      if (initialLabel === null || initialControl === null || hintBox === null || descriptionBox === null || initialGroup === null) {
        throw new Error("The hinted choice must render its associated description below the label and control");
      }
      expect(descriptionBox.y).toBeGreaterThanOrEqual(
        Math.max(initialLabel.y + initialLabel.height, initialControl.y + initialControl.height, hintBox.y + hintBox.height),
      );
      expect(descriptionBox.x).toBeCloseTo(initialLabel.x, 0);
      expect(descriptionBox.x + descriptionBox.width).toBeLessThanOrEqual(initialGroup.x + initialGroup.width + 1);
      if (regime.coarse) {
        await hint.tap();
      } else {
        await hint.click();
      }
      const explanation = page.getByRole("dialog", { name: "More info about Archive entries", exact: true });
      await expect(explanation).toContainText("Archive entries retain the source text.");
      await page.keyboard.press("Escape");
      await expect(explanation).toBeHidden();
      const targetFindings = regime.coarse ? await touchTargetFindings(page) : [];
      expect(targetFindings).toEqual([]);

      await mounted.update({ width: regime.width, showError: true, disabled: true });
      await expect(images).toBeDisabled();
      await expect(images).toHaveAccessibleDescription("Finish indexing before changing this choice.");
      await expect(archive).toHaveAttribute("aria-invalid", "true");
      await expect(archive).toHaveAccessibleDescription(/Keep the source entries.*Choose at least one available destination/u);
      const error = field.locator('[data-slot="field-error"]');
      const geometry = await Promise.all([label.boundingBox(), archive.boundingBox(), error.boundingBox(), field.boundingBox(), group.boundingBox()]);
      const [labelBox, controlBox, errorBox, fieldBox, groupBox] = geometry;
      if (labelBox === null || controlBox === null || errorBox === null || fieldBox === null || groupBox === null) {
        throw new Error("The rich choice must render its label, mark, error and shared track");
      }
      expect(errorBox.y).toBeGreaterThanOrEqual(Math.max(labelBox.y + labelBox.height, controlBox.y + controlBox.height));
      expect(errorBox.x).toBeCloseTo(labelBox.x, 0);
      expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 1);
      expect(errorBox.x + errorBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 1);
      await expect(chats).toBeEnabled();
      await expect(chats).toBeChecked();
    });
  });
}
