import { AA_NORMAL_RATIO } from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/pixel-contrast.ts";
import { expect, test } from "@playwright/test";
import type { ReadingBandStory, SemanticContrastStory } from "./_contrast-stories.tsx";

import { BASES } from "./contrast-cases.ts";

for (const { name, background } of BASES) {
  test(`${name}: emitted semantic and muted/input tokens clear their painted backings`, async ({ mount, page }, testInfo) => {
    const component = await mount<typeof SemanticContrastStory>("tests/ui/content/theme-scope/_contrast-stories/SemanticContrastStory", { background });
    const subjects = component.locator("p");
    await expect(subjects).toHaveCount(18);
    for (const subject of await subjects.all()) {
      await expect(subject).toBeVisible();
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, `${await subject.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}

for (const { name, background } of BASES.slice(0, 4)) {
  test(`${name}: reading band is the live plate color, opaque over black and white art`, async ({ mount, page }, testInfo) => {
    const component = await mount<typeof ReadingBandStory>("tests/ui/content/theme-scope/_contrast-stories/ReadingBandStory", { background });
    for (const art of ["black", "white"]) {
      const host = component.getByLabel(`${art} art`, { exact: true });
      const band = host.getByText("Reading band", { exact: true });
      const reference = host.getByText("Opaque plate reference", { exact: true });
      await expect(band).toBeVisible();
      const bandSurface = await pixelSurface(page, band);
      const plateSurface = await pixelSurface(page, reference);
      expect(bandSurface.rgb, `${art} art: ${bandSurface.describe} versus opaque live plate ${plateSurface.describe}`).toEqual(plateSurface.rgb);
      for (const subject of [band, host.getByText("Reading plate", { exact: true })]) {
        const receipt = await pixelContrast(page, subject);
        expect(receipt.ratio, `${art} art: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}
