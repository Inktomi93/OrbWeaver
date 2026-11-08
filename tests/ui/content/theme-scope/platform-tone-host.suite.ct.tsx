// D336: a soft tone tint mixes over the surface it sits on, so a badge on a card, a raised rail or a popover stays apart
// from that host by the tint separation in the painted pixels, under every seed palette and a custom ThemeScope.
import type { ToneHost } from "@orb/kit/theme-derivation";
import { oklabDistance, srgbToOklch, TONE_HOSTS, TONE_TINT_SEPARATION } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_SCOPES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { ToneHostStory } from "./_tone-host-stories.tsx";
import { BASES } from "./contrast-cases.ts";

const STORY = "tests/ui/content/theme-scope/_tone-host-stories/ToneHostStory";
// Every host but the page: each surface the story mounts, so a host added to `TONE_HOSTS` is judged here or fails.
const SURFACE_HOSTS: readonly ToneHost[] = TONE_HOSTS.filter((host) => host !== "background");
// A tint on a host: a soft badge, an inline token in each tone, and the dice chip the transcript renders.
const TINTS = '[data-badge], [data-slot="message-dice-chip"]';

const CASES = [...SEED_SCOPES, ...BASES.map(({ name, background }) => ({ name: `custom ${name}`, background }))] as const;

test("an inline token's side padding is the tight spacing token, so the dice stamp's text clears its tint edge", async ({ mount, page }) => {
  await mount<typeof ToneHostStory>(STORY, {});
  const tight = await page.locator('[data-probe="tight"]').evaluate((element) => getComputedStyle(element).inlineSize);
  const chip = page.locator('[data-slot="message-dice-chip"]').first();
  await expect(chip).toBeVisible();
  for (const side of ["padding-inline-start", "padding-inline-end"]) {
    expect(await chip.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), side), side).toBe(tight);
  }
});

for (const { name, ...props } of CASES) {
  test(`${name}: a soft badge or inline token's tint stands apart from its card, raised, popover and bubble host`, async ({ mount, page }) => {
    const component = await mount<typeof ToneHostStory>(STORY, props);
    const merged: string[] = [];
    let judged = 0;
    // The popup must end above the card host, or a card or raised sample reads the popup's fill instead.
    await expect(page.locator('[data-host="popover"]')).toBeVisible();
    const popup = await page.locator('[data-host="popover"]').boundingBox();
    const card = (await page.locator('[data-host="card"]').boundingBox())?.y ?? 0;
    expect(popup === null ? Number.NaN : popup.y + popup.height).toBeLessThanOrEqual(card);
    for (const host of SURFACE_HOSTS) {
      const surface = page.locator(`[data-host="${host}"]`);
      await expect(surface).toBeVisible();
      const sample = surface.locator('[data-sample="host"]');
      await sample.scrollIntoViewIfNeeded();
      const ground = srgbToOklch((await pixelSurface(page, sample)).rgb);
      const badges = await surface.locator(TINTS).all();
      expect(badges.length, `${host} renders its badges`).toBeGreaterThan(0);
      for (const badge of badges) {
        await badge.scrollIntoViewIfNeeded();
        const tint = srgbToOklch((await pixelSurface(page, badge)).rgb);
        const distance = oklabDistance(tint, ground);
        judged += 1;
        if (distance < TONE_TINT_SEPARATION) {
          merged.push(`${(await badge.getAttribute("data-badge")) ?? "dice chip"} on ${host}: ${distance.toFixed(4)} off ${JSON.stringify(ground)}`);
        }
      }
    }
    expect(judged).toBeGreaterThan(0);
    expect(merged).toEqual([]);
    await expect(component).toBeVisible();
  });
}
