import { expect, test } from "@playwright/test";
import type { WaystoneStory } from "./waystone-stories.tsx";

const STORY = "tests/ui/charts/meter/waystone-stories/WaystoneStory";
const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;
const SAMPLE_MINUTES = 30;
const SKY_FROM = '[data-slot="waystone-sky-from"]';
const SKY_TO = '[data-slot="waystone-sky-to"]';
const ATMOSPHERIC_TOKEN = "var(--color-sky-";
const EMBER_TOKEN = "var(--color-sky-ember)";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", contrast: "no-preference", forcedColors: "none" });
});

test("the public clock paints distinct half-hour skies and wraps continuously through midnight", async ({ mount }) => {
  const component = await mount<typeof WaystoneStory>(STORY, { clock: { hour: 0, minute: 0 }, weather: "clear" });
  const stone = component.locator('[data-slot="waystone"]');
  await expect(stone).toBeVisible();
  const skies = new Set<string>();
  const samples = Array.from({ length: (HOURS_IN_DAY * MINUTES_IN_HOUR) / SAMPLE_MINUTES }, (_, index) => index * SAMPLE_MINUTES);
  for (const minutes of samples) {
    await component.update({ clock: { hour: Math.floor(minutes / MINUTES_IN_HOUR), minute: minutes % MINUTES_IN_HOUR }, weather: "clear" });
    const sky = await stone.evaluate((svg) => {
      const from = svg.querySelector('[data-slot="waystone-sky-from"]');
      const to = svg.querySelector('[data-slot="waystone-sky-to"]');
      if (from === null || to === null) {
        throw new Error("The clock did not render its sky gradient");
      }
      return {
        from: getComputedStyle(from).stopColor,
        to: getComputedStyle(to).stopColor,
        cy: from.parentElement?.getAttribute("cy"),
        fromRecipe: from.getAttribute("stop-color"),
        toRecipe: to.getAttribute("stop-color"),
      };
    });
    for (const recipe of [sky.fromRecipe, sky.toRecipe]) {
      expect(recipe).toContain(ATMOSPHERIC_TOKEN);
      expect(recipe).not.toContain("var(--color-track-");
      expect(recipe).not.toContain("var(--color-background)");
    }
    skies.add(JSON.stringify([sky.from, sky.to, sky.cy]));
  }
  expect(skies.size).toBe(samples.length);
  await component.update({ clock: { hour: 0, minute: 0 }, weather: "clear" });
  const midnight = await component.locator(SKY_FROM).getAttribute("stop-color");
  await component.update({ clock: { hour: HOURS_IN_DAY, minute: 0 }, weather: "clear" });
  await expect(component.locator(SKY_FROM)).toHaveAttribute("stop-color", midnight ?? "missing midnight sky");
  await expect(component.locator('[data-slot="waystone-celestial"]')).toHaveAttribute("data-body", "moon");
  await expect(component.locator(SKY_TO)).toHaveAttribute("stop-color", /var\(--color-sky-night\)/u);
});

test("golden windows paint ember below the midday sky and intermediate hours blend both neighboring skies", async ({ mount }) => {
  const component = await mount<typeof WaystoneStory>(STORY, { clock: { hour: 12, minute: 0 }, weather: "clear" });
  const from = component.locator(SKY_FROM);
  const gradient = component.locator("radialGradient");
  await expect(from).toHaveAttribute("stop-color", "var(--color-sky-day-horizon)");
  const middayCenter = Number.parseFloat((await gradient.getAttribute("cy")) ?? "");
  const middayPaint = await from.evaluate((stop) => getComputedStyle(stop).stopColor);
  for (const hour of [6, 18]) {
    await component.update({ clock: { hour, minute: 0 }, weather: "clear" });
    await expect(from).toHaveAttribute("stop-color", /var\(--color-sky-ember\)/u);
    expect(await from.getAttribute("stop-color")).toContain(EMBER_TOKEN);
    expect(Number.parseFloat((await gradient.getAttribute("cy")) ?? "")).toBeGreaterThan(middayCenter);
    expect(await from.evaluate((stop) => getComputedStyle(stop).stopColor)).not.toBe(middayPaint);
  }
  await component.update({ clock: { hour: 10, minute: 30 }, weather: "clear" });
  await expect(from).toHaveAttribute("stop-color", /^color-mix\(in oklab, color-mix\(/u);
  expect(await from.getAttribute("stop-color")).not.toContain(EMBER_TOKEN);
  await expect(component.locator('[data-slot="waystone-celestial"]')).toHaveAttribute("data-body", "sun");
});
