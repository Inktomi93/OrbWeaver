import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import type { SettingsCompositionStory } from "@orb/testkit/browser";
import { resolvedLength, touchTargetFindings } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";

for (const regime of [
  { label: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false },
  { label: "narrow desktop pane", width: 342, viewport: { width: 1280, height: 900 }, coarse: false },
  { label: "phone portrait", width: 342, viewport: { width: 390, height: 844 }, coarse: true },
  { label: "phone landscape", width: 796, viewport: { width: 844, height: 390 }, coarse: true },
] as const) {
  test.describe(regime.label, () => {
    test.use({ hasTouch: regime.coarse, isMobile: regime.coarse, viewport: regime.viewport });

    test("Backup keeps each inclusion label beside its checkbox with operable selection", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]));
      await mount<typeof SettingsCompositionStory>("tests/support/browser/ct-settings-composition-stories/SettingsCompositionStory", {
        sectionId: "backup-export",
        width: regime.width,
        paneInset: true,
      });
      const include = page.getByRole("group", { name: "Include", exact: true });
      const checkboxes = include.getByRole("checkbox");
      await expect(checkboxes.first()).toBeVisible();
      expect(await checkboxes.count()).toBeGreaterThan(1);
      const fields = include.locator('[data-slot="field-root"]');
      await expect(fields).toHaveCount(await checkboxes.count());
      const controlStarts: number[] = [];
      const verticalOverlaps: number[] = [];
      for (const field of await fields.all()) {
        const checkbox = field.getByRole("checkbox");
        await expect(checkbox).toBeChecked();
        const label = field.locator('[data-slot="field-label"]');
        const labelText = await label.textContent();
        if (labelText === null) {
          throw new Error("Each inclusion must have a visible label");
        }
        await expect(checkbox).toHaveAccessibleName(labelText);
        const labelBox = await label.boundingBox();
        const checkboxBox = await checkbox.boundingBox();
        if (labelBox === null || checkboxBox === null) {
          throw new Error("Each inclusion must expose its visible label and checkbox");
        }
        verticalOverlaps.push(Math.min(labelBox.y + labelBox.height, checkboxBox.y + checkboxBox.height) - Math.max(labelBox.y, checkboxBox.y));
        controlStarts.push(checkboxBox.x);
        await label.click();
        await expect(checkbox).not.toBeChecked();
        await checkbox.focus();
        await page.keyboard.press("Space");
        await expect(checkbox).toBeChecked();
      }
      const touchFindings = regime.coarse ? await touchTargetFindings(page) : [];
      expect(touchFindings).toEqual([]);
      const centres = await checkboxes.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return box.y + box.height / 2;
        }),
      );
      const pitch = Math.min(...centres.slice(1).map((centre, index) => centre - (centres[index] ?? centre)));
      const floor = regime.coarse ? await resolvedLength(page, "var(--size-touch-target)", include) : 0;
      expect(pitch).toBeGreaterThanOrEqual(floor);
      expect(Math.min(...verticalOverlaps)).toBeGreaterThan(0);
      expect(Math.max(...controlStarts) - Math.min(...controlStarts)).toBeLessThanOrEqual(1);
      const download = page.getByRole("button", { name: "Download my library", exact: true });
      await expect(download).toBeEnabled();
      for (const checkbox of await checkboxes.all()) {
        await checkbox.uncheck();
      }
      await expect(download).toBeDisabled();
      await checkboxes.first().check();
      await expect(download).toBeEnabled();
    });
  });
}
