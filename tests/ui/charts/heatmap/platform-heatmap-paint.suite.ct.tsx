// Heatmap cells and legend stops keep live token colors through zrender interpolation, in real engine pixels.
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { z } from "zod";
import type { HeatmapPaintStory } from "./_heatmap-paint-stories.tsx";
import { HEATMAP_PAINT_THEMES as THEMES } from "./heatmap-paint-themes.ts";

const RGBA = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const POINT = z.tuple([z.number(), z.number()]);
const TRIPLE_RGBA = z.tuple([RGBA, RGBA, RGBA]);
const NATIVE = z.object({ css: z.string(), pixel: RGBA });
const PAINT = z.object({
  series: NATIVE,
  border: NATIVE,
  cells: z.tuple([POINT, POINT, POINT]),
  stops: z.tuple([POINT, POINT, POINT]),
  layers: z.array(z.object({ cells: TRIPLE_RGBA, stops: TRIPLE_RGBA })),
});
type Paint = z.output<typeof PAINT>;
type Rgba = z.output<typeof RGBA>;

// Canvas byte rounding and premultiplied-alpha round trips; an unparsed color lands far outside it.
const CHANNEL_TOLERANCE = 3;
const RGB_CHANNELS = 3;
const OPAQUE = 255;
const WIDTH = 415;

function channelGap(actual: readonly number[], expected: readonly number[], channels = expected.length): number {
  return Math.max(...expected.slice(0, channels).map((channel, index) => Math.abs(channel - (actual[index] ?? Number.NaN))));
}

function near(actual: readonly number[], expected: readonly number[], channels = expected.length): boolean {
  return channelGap(actual, expected, channels) <= CHANNEL_TOLERANCE;
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(...a.slice(0, RGB_CHANNELS).map((channel, index) => channel - (b[index] ?? Number.NaN)));
}

function distinct(pixels: readonly Rgba[]): number {
  return new Set(pixels.map((pixel) => pixel.join())).size;
}

async function readPaint(page: Page): Promise<Paint> {
  await page.getByRole("button", { name: "Read heatmap paint", exact: true }).click();
  return PAINT.parse(JSON.parse((await page.getByLabel("Heatmap paint", { exact: true }).textContent()) ?? ""));
}

/** The engine's composited screen pixels at chart-local points. */
async function composited(page: Page, points: readonly (readonly [number, number])[]): Promise<{ readonly png: Buffer; readonly pixels: Rgba[] }> {
  const png = await page.locator('[data-slot="heatmap"] [data-slot="chart"]').screenshot({ scale: "css", animations: "disabled" });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = points.map(([x, y]): Rgba => {
    const offset = (Math.floor(y) * info.width + Math.floor(x)) * info.channels;
    return [data[offset] ?? Number.NaN, data[offset + 1] ?? Number.NaN, data[offset + 2] ?? Number.NaN, data[offset + 3] ?? Number.NaN];
  });
  return { png, pixels };
}

test("Heatmap cells and legend stops paint distinct live token colors across theme changes", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  const story = await mount<typeof HeatmapPaintStory>("tests/ui/charts/heatmap/_heatmap-paint-stories/HeatmapPaintStory", { width: WIDTH });
  // Each theme step must repaint: its low-to-high cell paint differs from every other step.
  const paints = new Set<string>();
  for (const theme of THEMES) {
    await test.step(theme.name, async () => {
      await page.evaluate((mode) => document.documentElement.setAttribute("data-theme", mode), theme.mode);
      await story.update({ width: WIDTH, tokens: theme.tokens, overrides: theme.overrides });
      // The live-token store repaints after its observer fires; wait for the cell layer to carry both ramp ends.
      await expect
        .poll(async () => {
          const current = await readPaint(page);
          return Math.min(
            ...current.layers.map((candidate) =>
              Math.max(channelGap(candidate.cells[2], current.series.pixel), channelGap(candidate.cells[0], current.border.pixel)),
            ),
          );
        })
        .toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      const paint = await readPaint(page);
      // Cell composites are evidence only: under mobile emulation Playwright's WebKit can paint the root
      // background into an upper canvas layer's transparent pixels, which covers the cells beneath it.
      const screen = await composited(page, [...paint.stops, ...paint.cells]);
      const stopScreen = screen.pixels.slice(0, paint.stops.length);
      await test.info().attach(`${theme.name}-heatmap.png`, { body: screen.png, contentType: "image/png" });
      await test.info().attach(`${theme.name}-paint.json`, {
        body: JSON.stringify({ paint, composited: { stops: stopScreen, cells: screen.pixels.slice(paint.stops.length) } }),
        contentType: "application/json",
      });

      expect(paint.series.pixel[3]).toBe(OPAQUE);
      const cellLayer = paint.layers.find((layer) => near(layer.cells[2], paint.series.pixel));
      // The legend paints after the progressive series, so zrender puts it on the topmost canvas.
      const rampLayer = paint.layers.at(-1);
      if (cellLayer === undefined || rampLayer === undefined) {
        throw new Error(`No renderer layer paints ${paint.series.css}`);
      }
      // The ramp ends are the live tokens; the transparent end keeps the border token's straight alpha.
      const [low, mid, high] = cellLayer.cells;
      expect(near(low, paint.border.pixel), `low cell ${low.join()} must paint ${paint.border.css}`).toBe(true);
      expect(distinct([low, mid, high])).toBe(3);
      expect(mid[3]).toBeGreaterThan(low[3]);
      expect(mid[3]).toBeLessThan(high[3]);

      // The legend runs toward the live series color, and its topmost layer composites as painted.
      const [lowStop, midStop, highStop] = rampLayer.stops;
      expect(distinct(rampLayer.stops)).toBe(3);
      expect(distance(midStop, paint.series.pixel)).toBeLessThan(distance(lowStop, paint.series.pixel));
      expect(distance(highStop, paint.series.pixel)).toBeLessThan(distance(midStop, paint.series.pixel));
      for (const [index, stop] of rampLayer.stops.entries()) {
        expect(near(stopScreen[index] ?? [], stop, RGB_CHANNELS), `legend stop ${String(index)} composites as painted`).toBe(true);
      }
      paints.add(JSON.stringify(cellLayer.cells));
    });
  }
  expect(paints.size).toBe(THEMES.length);
});
