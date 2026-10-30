import type { Oklch } from "@orb/kit/theme-derivation";
import { AA_NON_TEXT_RATIO, AA_NORMAL_RATIO, oklabDistance, srgbToOklch, TONE_TINT_SEPARATION, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelContrast, pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type {
  NestedSeedStory,
  ReadingBandStory,
  SelectedRowStory,
  SemanticContrastStory,
  ToneHueStory,
  ToneMarkStory,
  ToneRoleContrastStory,
} from "./_contrast-stories.tsx";

import { BASES, keepsHue, MID_GREY } from "./contrast-cases.ts";

for (const { name, background } of BASES) {
  test(`${name}: emitted semantic and muted/input tokens clear their painted backings`, async ({ mount, page }, testInfo) => {
    const component = await mount<typeof SemanticContrastStory>("tests/ui/content/theme-scope/_contrast-stories/SemanticContrastStory", { background });
    const subjects = component.locator("p");
    await expect(subjects).toHaveCount(18);
    for (const subject of await subjects.all()) {
      await expect(subject).toBeVisible();
      await subject.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, `${await subject.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}

const TONE_CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  ...BASES.map(({ name, background }) => ({ name: `custom ${name} nested in the light seed`, theme: "light" as const, background })),
] as const;

for (const { name, ...props } of TONE_CASES) {
  test(`${name}: every D336 tone role pair clears its floor in the painted pixels`, async ({ mount, page }) => {
    const component = await mount<typeof ToneRoleContrastStory>("tests/ui/content/theme-scope/_contrast-stories/ToneRoleContrastStory", props);
    const subjects = component.locator("[data-tone]");
    await expect(subjects.first()).toBeVisible();
    const all = await subjects.all();
    expect(all.length).toBeGreaterThan(0);
    for (const subject of all) {
      // The pairs outgrow one viewport; the pixel read needs each one on screen.
      await subject.scrollIntoViewIfNeeded();
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, `${await subject.textContent()}: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
    }
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
      await host.scrollIntoViewIfNeeded();
      const bandSurface = await pixelSurface(page, band);
      const plateSurface = await pixelSurface(page, reference);
      expect(bandSurface.rgb, `${art} art: ${bandSurface.describe} versus opaque live plate ${plateSurface.describe}`).toEqual(plateSurface.rgb);
      for (const subject of [band, host.getByText("Reading plate", { exact: true })]) {
        await subject.scrollIntoViewIfNeeded();
        const receipt = await pixelContrast(page, subject);
        expect(receipt.ratio, `${art} art: ${receipt.describe}`).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
      }
    }
    const screenshot = testInfo.outputPath("settled-theme.png");
    await component.screenshot({ path: screenshot, animations: "disabled" });
    await testInfo.attach("settled-theme", { path: screenshot, contentType: "image/png" });
  });
}

test("a custom mid-grey page keeps every colored tone's hue in its painted text, tints and solid", async ({ mount, page }) => {
  const component = await mount<typeof ToneHueStory>("tests/ui/content/theme-scope/_contrast-stories/ToneHueStory", { background: MID_GREY });
  const ground = srgbToOklch((await pixelSurface(page, component.locator('[data-sample="ground"]'), { region: { x0: 0, x1: 0.01, y0: 0, y1: 0.01 } })).rgb);
  const tones = await component.locator("[data-tone]").all();
  expect(tones.length).toBeGreaterThan(0);
  const lost: string[] = [];
  for (const tone of tones) {
    const name = await tone.getAttribute("data-tone");
    await tone.scrollIntoViewIfNeeded();
    const fill = async (sample: string): Promise<Oklch> => srgbToOklch((await pixelSurface(page, tone.locator(`[data-sample="${sample}"]`))).rgb);
    const solid = await fill("solid");
    const tints = { tint: await fill("tint"), "tint-active": await fill("tint-active") };
    const text = srgbToOklch((await pixelContrast(page, tone.locator('[data-sample="text"]'))).ink);
    for (const [role, painted] of Object.entries({ solid, text, ...tints })) {
      if (!keepsHue(painted, solid.h)) {
        lost.push(`${name} ${role} paints ${JSON.stringify(painted)} beside a solid at ${JSON.stringify(solid)}`);
      }
    }
    for (const [role, painted] of Object.entries(tints)) {
      if (oklabDistance(painted, ground) < TONE_TINT_SEPARATION) {
        lost.push(`${name} ${role} ${JSON.stringify(painted)} merges with the page ${JSON.stringify(ground)}`);
      }
    }
  }
  expect(lost).toEqual([]);
});

test("a selected row's label clears AA on its primary tint over a custom mid-grey page", async ({ mount, page }) => {
  const component = await mount<typeof SelectedRowStory>("tests/ui/content/theme-scope/_contrast-stories/SelectedRowStory", { background: MID_GREY });
  const label = component.getByText("Connections", { exact: true });
  await expect(label).toBeVisible();
  const receipt = await pixelContrast(page, label);
  expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(AA_NORMAL_RATIO);
});

test("a seed palette nested inside a custom mid-grey scope paints its own tone roles", async ({ mount, page }) => {
  await mount<typeof NestedSeedStory>("tests/ui/content/theme-scope/_contrast-stories/NestedSeedStory", { background: MID_GREY });
  const painted = (nest: string): Promise<Readonly<Record<string, string>>> =>
    page
      .locator(`[data-nest="${nest}"] [data-role-sample]`)
      .evaluateAll((samples) =>
        Object.fromEntries(samples.map((sample) => [sample.getAttribute("data-role-sample"), getComputedStyle(sample).backgroundColor])),
      );
  const onPage = await painted("page");
  expect(Object.keys(onPage).length).toBeGreaterThan(0);
  expect(await painted("carried")).toEqual(onPage);
});

for (const theme of [undefined, ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[])]) {
  test(`${theme ?? "hearth"}: a meter zone fill and a status Card edge hold the 3:1 non-text floor`, async ({ mount, page }) => {
    const component = await mount<typeof ToneMarkStory>("tests/ui/content/theme-scope/_contrast-stories/ToneMarkStory", theme === undefined ? {} : { theme });
    for (const accent of ["info", "warning"]) {
      const bar = component.locator(`[data-mark="meter-${accent}"] [data-slot="track-bar"]`);
      await expect(bar).toBeVisible();
      const fill = await pixelSurface(page, bar.locator('[data-slot="track-bar-fill"]'));
      // The bar is half full, so its far end is bare track.
      const track = await pixelSurface(page, bar, { region: { x0: 0.8, x1: 0.98, y0: 0.2, y1: 0.8 } });
      expect(wcagContrastRatio(fill.rgb, track.rgb), `meter ${accent}: ${fill.describe} on ${track.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
    const ground = await pixelSurface(page, component.locator(`[data-mark="ground"]`), { region: { x0: 0.01, x1: 0.03, y0: 0.0, y1: 0.02 } });
    for (const tone of ["warning", "info"]) {
      const card = component.locator(`[data-mark="card-${tone}"]`);
      const box = await card.boundingBox();
      if (box === null) {
        throw new Error(`card ${tone} has no box`);
      }
      const edge = await pixelSurface(page, card, { region: { x0: 0.4, x1: 0.6, y0: 0, y1: 1 / box.height } });
      expect(wcagContrastRatio(edge.rgb, ground.rgb), `card ${tone}: ${edge.describe} on ${ground.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
