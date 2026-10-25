import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { SkeletonReservationStory } from "./_skeleton-reservation-stories.tsx";

const ROWS = 3;
const SUBPIXEL_PX = 1;
const SCALES = [0.8, 1.25] as const;

for (const touch of [false, true]) {
  test.describe(touch ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: touch, isMobile: touch, viewport: { width: 390, height: 844 } });
    for (const scale of SCALES) {
      for (const ownerCss of [false, true]) {
        test(`reservation fits native rows at scale ${scale}${ownerCss ? " with owner CSS" : ""}`, async ({ page, mount }) => {
          await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none", contrast: "no-preference" });
          await page.addInitScript(
            ({ fontScale, override, control }) => {
              document.addEventListener(
                "DOMContentLoaded",
                () => {
                  document.documentElement.style.fontSize = `${fontScale * 100}%`;
                  if (override) {
                    document.documentElement.style.setProperty(control, "round(up, calc(max(3rem, 48px) + 0.5rem), 1px)");
                  }
                },
                { once: true },
              );
            },
            { fontScale: scale, override: ownerCss, control: TOKENS["size.control-lg"].cssVar },
          );
          await mount<typeof SkeletonReservationStory>("tests/client/components/_skeleton-reservation-stories/SkeletonReservationStory", { rows: ROWS });
          expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(touch);
          expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe(`${scale * 100}%`);
          expect(
            await page.evaluate(
              (control) => getComputedStyle(document.documentElement).getPropertyValue(control).includes("calc("),
              TOKENS["size.control-lg"].cssVar,
            ),
          ).toBe(ownerCss);
          const rendered = page.locator('[aria-busy="true"]');
          await expect(rendered).toBeVisible();
          const actual = await rendered.evaluate((element) => element.getBoundingClientRect().height);
          const declared = Number(await page.getByRole("status", { name: "Declared skeleton height", exact: true }).textContent());
          expect(Number.isFinite(declared)).toBe(true);
          expect(Math.abs(declared - actual)).toBeLessThanOrEqual(SUBPIXEL_PX);
          await expect(page.getByRole("status", { name: "Recovered skeleton rows", exact: true })).toHaveText(String(ROWS));
        });
      }
    }
  });
}
