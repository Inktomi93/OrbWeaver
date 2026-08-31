// CT: the chart chrome must paint the ACTIVE theme's tokens, and REPAINT when anything moves them — a
// browser test because the whole mechanism (a MutationObserver over the root's attributes, its ancestors'
// inline styles and `<head>`; a `getComputedStyle` read; the real `html[data-theme-colorization]` rule)
// only exists in a live cascade. The harness page loads the client's real stylesheet stack in production
// order (playwright-ct.config.ts), so the colorization rule under test is the SHIPPED one
// (`packages/client/src/styles/globals.css`), not a fixture.
//
// Measured defect this pins (#503, side-eye colorization pass 2026-08-22 side effect 5): with the store
// watching only `data-theme`, flipping the exact attribute the app writes
// (`use-appearance-root-effects.ts:82`) moved the DOM card border instantly while the histogram canvas
// stayed BYTE-IDENTICAL — chart chrome was stale until the chart remounted. Hence the second assertion:
// the mount id must be UNCHANGED, or a green here would only prove React threw the subtree away.

import { TOKEN_POLARITY_ARMS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import {
  ChartThemeAxisLineReadoutStory,
  CustomAcceptedChartCasesStory,
  CustomLightChartRampStory,
  CustomMidlightChartRampStory,
  CustomThemeChartAxisLineStory,
  RejectedContextualChartCasesStory,
} from "../_ct-stories.tsx";

/** Each arm's SETTLED value, matched by the CSS function that only that arm can produce: the base
 *  `color.border` token is a bare `oklch()` (`packages/ui/src/tokens/index.ts`), while the shipped
 *  `html[data-theme-colorization]` declaration is a `color-mix()` against the accent. Both are
 *  auto-retrying assertions on a resting DOM state, never a mid-flight snapshot. */
const BASE_ARM = /^oklch\(/;
const COLORIZED_ARM = /^color-mix\(/;

/** The story mints one id per mounted instance, so the FIRST mount is `mount-1` — asserting the literal
 *  after the flip is what separates "the store re-resolved" from "React remounted the subtree". */
const FIRST_MOUNT_ID = "mount-1";

test("re-resolves chart chrome when the colorization axis flips, with no remount (#503)", async ({ mount, page }) => {
  // The story's own root element carries the readout — `mount()` returns THAT element, so a
  // `.locator()` descendant search under it finds nothing (paid once while writing this test).
  const readout = await mount(<ChartThemeAxisLineReadoutStory />);
  await expect(readout).toHaveAttribute("data-axis-line", BASE_ARM);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);

  await page.evaluate((): void => {
    document.documentElement.toggleAttribute("data-theme-colorization", true);
  });

  await expect(readout).toHaveAttribute("data-axis-line", COLORIZED_ARM);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
});

/** The story's two custom arms — `borderColor` reaches `--color-border` byte-identically, so the readout
 *  must carry each arm's token value verbatim while that arm is in force (`_ct-stories.tsx`). */
const CUSTOM_ARM_ONE = TOKEN_POLARITY_ARMS["color.chart-3"].dark;
const CUSTOM_ARM_TWO = TOKEN_POLARITY_ARMS["color.chart-4"].dark;

/** The two arms of the seam's OTHER read: a computed `color` is some colour FUNCTION, and specifically NOT
 *  the `light-dark(<light>, <dark>)` token stream a raw custom-property read hands back (which no canvas
 *  can paint — resolving it through the cascade is that path's whole job). */
const A_COLOR_FUNCTION = /^[a-z-]+\(/;
const UNRESOLVED_INTENT_TOKEN = /^light-dark\(/;

test("resolves the polarity-aware chart ramp to five concrete Canvas colors on Light", async ({ mount, page }) => {
  await page.evaluate((): void => {
    document.documentElement.dataset["theme"] = "light";
  });
  const readout = await mount(<ChartThemeAxisLineReadoutStory />);
  await expect(readout).toHaveAttribute("data-series", TOKEN_POLARITY_ARMS["color.chart-1"].light);
  await expect
    .poll(async () => (await readout.getAttribute("data-palette"))?.split("|") ?? [])
    .toEqual([
      TOKEN_POLARITY_ARMS["color.chart-1"].light,
      TOKEN_POLARITY_ARMS["color.chart-2"].light,
      TOKEN_POLARITY_ARMS["color.chart-3"].light,
      TOKEN_POLARITY_ARMS["color.chart-4"].light,
      TOKEN_POLARITY_ARMS["color.chart-5"].light,
    ]);
  const serialized = `${await readout.getAttribute("data-series")} ${await readout.getAttribute("data-palette")}`;
  expect(serialized).not.toContain("light-dark(");
  expect(serialized).not.toContain("var(");
});

test("a custom light ThemeScope emits a concrete chart ramp", async ({ mount }) => {
  const scope = await mount(<CustomLightChartRampStory />);
  const readout = scope.locator("p[data-series]");
  await expect(readout).toHaveAttribute("data-series", A_COLOR_FUNCTION);
  await expect.poll(async () => (await readout.getAttribute("data-palette"))?.split("|").length ?? 0).toBe(5);
});

test("a custom midlight ThemeScope renders a real chart with five 3:1 categorical fills", async ({ mount }) => {
  const scope = await mount(<CustomMidlightChartRampStory />);
  const panel = scope.getByTestId("midlight-chart-panel");
  await expect(panel.locator("canvas")).toBeVisible();
  await expect(panel).toHaveAttribute("data-echarts-option", /"series"/u);
  await expect
    .poll(
      async () =>
        await panel.evaluate((element) => {
          const rawOption = element.getAttribute("data-echarts-option");
          const option = rawOption === null ? {} : JSON.parse(rawOption);
          const colors = (option.series ?? []).flatMap((series) =>
            (series.data ?? []).flatMap((datum) => (typeof datum.itemStyle?.color === "string" ? [datum.itemStyle.color] : [])),
          );
          const chartCanvas = element.querySelector("canvas");
          const parserCanvas = document.createElement("canvas");
          parserCanvas.width = 1;
          parserCanvas.height = 1;
          const parser = parserCanvas.getContext("2d");
          const chart = chartCanvas?.getContext("2d") ?? null;
          if (parser === null || chart === null) {
            return { colorCount: colors.length, distinctColorCount: 0, minimumRatioClears: false, renderedColorCount: 0, unresolvedColorCount: 0 };
          }
          const rgb = (color: string): readonly [number, number, number] => {
            parser.clearRect(0, 0, 1, 1);
            parser.fillStyle = color;
            parser.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, b = 0] = parser.getImageData(0, 0, 1, 1).data;
            return [r, g, b];
          };
          const luminance = ([r, g, b]: readonly [number, number, number]): number => {
            const [lr, lg, lb] = [r, g, b].map((value) => {
              const channel = value / 255;
              return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
          };
          const backing = luminance(rgb(getComputedStyle(element).backgroundColor));
          const chartPixels = chart.getImageData(0, 0, chartCanvas?.width ?? 0, chartCanvas?.height ?? 0).data;
          const renderedMatches = colors.map((color) => {
            const [expectedR, expectedG, expectedB] = rgb(color);
            let matches = 0;
            for (let index = 0; index < chartPixels.length; index += 4) {
              const r = chartPixels[index] ?? 0;
              const g = chartPixels[index + 1] ?? 0;
              const b = chartPixels[index + 2] ?? 0;
              const alpha = chartPixels[index + 3] ?? 0;
              if (alpha > 250 && Math.abs(r - expectedR) <= 2 && Math.abs(g - expectedG) <= 2 && Math.abs(b - expectedB) <= 2) {
                matches += 1;
              }
            }
            return matches;
          });
          const minRatio = Math.min(
            ...colors.map((color) => {
              const fill = luminance(rgb(color));
              return (Math.max(fill, backing) + 0.05) / (Math.min(fill, backing) + 0.05);
            }),
          );
          return {
            colorCount: colors.length,
            distinctColorCount: new Set(colors).size,
            minimumRatioClears: colors.length === 5 && minRatio >= 3,
            renderedColorCount: renderedMatches.filter((matches) => matches > 0).length,
            unresolvedColorCount: colors.filter((color) => /(?:light-dark|var)\(/u.test(color)).length,
          };
        }),
    )
    .toEqual({ colorCount: 5, distinctColorCount: 5, minimumRatioClears: true, renderedColorCount: 5, unresolvedColorCount: 0 });
});

test("named, alpha-composited, and extreme accepted themes render five 3:1 ECharts fills", async ({ mount }) => {
  const scope = await mount(<CustomAcceptedChartCasesStory />);
  const panel = scope.getByTestId("accepted-chart-panel");
  for (const name of ["named", "transparent", "partial-alpha", "extreme-gamut"] as const) {
    await expect(panel).toHaveAttribute("data-case", name);
    await expect(panel.locator("canvas")).toBeVisible();
    await expect
      .poll(async () => {
        const palette = (await panel.locator("p[data-palette]").getAttribute("data-palette"))?.split("|") ?? [];
        return await panel.evaluate((element, colors): number => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (ctx === null || colors.length !== 5) {
            return 0;
          }
          const luminance = (color: string): number => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
            const [lr, lg, lb] = [r, g, b].map((value) => {
              const channel = value / 255;
              return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
          };
          const backing = luminance(getComputedStyle(element).backgroundColor);
          return Math.min(...colors.map((color) => (Math.max(luminance(color), backing) + 0.05) / (Math.min(luminance(color), backing) + 0.05)));
        }, palette);
      })
      .toBeGreaterThanOrEqual(3);
    if (name !== "extreme-gamut") {
      await panel.getByRole("button", { name: "Next accepted theme" }).click();
    }
  }
});

test("contextual backgrounds are rejected before derivation and the rendered chart retains five 3:1 fills", async ({ mount }) => {
  const scope = await mount(<RejectedContextualChartCasesStory />);
  const themeScope = scope.locator('[data-slot="theme-scope"]');
  const panel = scope.getByTestId("contextual-chart-panel");
  for (const name of ["current-color", "link-text", "active-text"] as const) {
    await expect(panel).toHaveAttribute("data-case", name);
    await expect(panel.locator("canvas")).toBeVisible();
    await expect.poll(async () => await themeScope.evaluate((element) => (element as HTMLElement).style.getPropertyValue("--color-background"))).toBe("");
    await expect
      .poll(async () => {
        const palette = (await panel.locator("p[data-palette]").getAttribute("data-palette"))?.split("|") ?? [];
        return await panel.evaluate((element, colors): number => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (ctx === null || colors.length !== 5) {
            return 0;
          }
          const luminance = (color: string): number => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
            const [lr, lg, lb] = [r, g, b].map((value) => {
              const channel = value / 255;
              return channel <= 0.039_28 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
          };
          const backing = luminance(getComputedStyle(element).backgroundColor);
          return Math.min(...colors.map((color) => (Math.max(luminance(color), backing) + 0.05) / (Math.min(luminance(color), backing) + 0.05)));
        }, palette);
      })
      .toBeGreaterThanOrEqual(3);
    if (name !== "active-text") {
      await panel.getByRole("button", { name: "Next rejected theme" }).click();
    }
  }
});

/** #504 — the marked-resolution-root contract. */
test("resolves chart chrome from the marked token root, so a custom theme paints its own tokens", async ({ mount, page }) => {
  // The measured defect: a CUSTOM theme sets NO `[data-theme]` — its palette is inline on <ThemeScope> over
  // the shell grid — so a store resolving from `documentElement` painted every canvas in the BASE palette
  // while the DOM around it painted the custom one. Read out as DOM for the same reason as the test above.
  const scope = await mount(<CustomThemeChartAxisLineStory />);
  const readout = scope.locator("p[data-axis-line]");
  await expect(readout).toHaveAttribute("data-axis-line", CUSTOM_ARM_ONE);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
  // The seam's OTHER read — the attached probe, whose host moved into the marked root with this fix. Read
  // once here rather than polled: the auto-retrying assertion above already settled this readout.
  await expect.poll(async () => await readout.getAttribute("data-series-positive")).toMatch(A_COLOR_FUNCTION);
  await expect.poll(async () => await readout.getAttribute("data-series-positive")).not.toMatch(UNRESOLVED_INTENT_TOKEN);

  // Custom → a DIFFERENT custom: the flip that moves NO attribute anywhere but ThemeScope's inline `style`.
  await scope.getByRole("button", { name: "Next theme" }).click();
  await expect(readout).toHaveAttribute("data-axis-line", CUSTOM_ARM_TWO);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);

  // Custom → seed/no-override: the scope stops declaring the token and the base cascade takes it back.
  let baseBorder = await page.evaluate((): string => getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim());
  await expect
    .poll(async () => {
      baseBorder = await page.evaluate((): string => getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim());
      return baseBorder;
    })
    .not.toBe("");
  await scope.getByRole("button", { name: "Next theme" }).click();
  await expect(readout).toHaveAttribute("data-axis-line", baseBorder);
  await expect(readout).toHaveAttribute("data-mount-id", FIRST_MOUNT_ID);
});
