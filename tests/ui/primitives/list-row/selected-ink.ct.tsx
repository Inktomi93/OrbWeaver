// A tint carries the tone's text-on-tint ink, never the page ink (D336 Contrast), and the active cell's gradient ring
// paints only its border, so the cell's own fill is the surface its ink sits on.
import { AA_NORMAL_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_SCOPES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { SelectedInkSeedStory, SelectedInkStory } from "./_selected-ink-stories.tsx";

for (const [name, label] of [
  ["selected ListRow label", "Connections"],
  ["active Tabs cell", "Active cell"],
] as const) {
  test(`${name} clears AA on its tint over a carried mid-grey page`, async ({ mount, page }) => {
    const component = await mount<typeof SelectedInkStory>("tests/ui/primitives/list-row/_selected-ink-stories/SelectedInkStory", {});
    const subject = component.getByText(label, { exact: true });
    await expect(subject).toBeVisible();
    // The active cell is marked after its first layout and its fill and ink ease in; a pixel read mid-ease is a blend.
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().map((animation) => animation.finished));
    });
    // The perimeter ring `pixelContrast` reads includes the selection rail and the cell's bottom bar, which are not the
    // tint; the ink sits on the box's own fill, read from its upper strip, clear of the glyphs and both edges.
    const { ink } = await pixelContrast(page, subject);
    const tint = await pixelSurface(page, subject, { region: { x0: 0.05, x1: 0.95, y0: 0.02, y1: 0.2 } });
    expect(wcagContrastRatio(ink, tint.rgb), `ink ${JSON.stringify(ink)} on tint ${tint.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
  });
}

const LABELS = ["Connections", "Active cell"] as const;

for (const { name, ...props } of SEED_SCOPES) {
  test(`${name}: the selected row and the active cell paint the tone's text-on-tint, which differs from the page ink`, async ({ mount }) => {
    const component = await mount<typeof SelectedInkSeedStory>("tests/ui/primitives/list-row/_selected-ink-stories/SelectedInkSeedStory", props);
    const inkOf = (target: ReturnType<typeof component.getByText>): Promise<string> => target.evaluate((element) => getComputedStyle(element).color);
    const onTint = await inkOf(component.locator('[data-probe="text-on-tint"]'));
    // The control: with the two inks equal the assertions below could not tell the recipes apart.
    expect(onTint).not.toBe(await inkOf(component.locator('[data-probe="page-ink"]')));
    for (const label of LABELS) {
      await expect(component.getByText(label, { exact: true })).toBeVisible();
      expect(await inkOf(component.getByText(label, { exact: true }))).toBe(onTint);
    }
  });
}
