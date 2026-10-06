import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { z } from "zod";
import { waitFrames } from "../../../support/browser/weave-drive.ts";
import { CaptureGlowProbe, WeaveBox } from "./web-weave.fixtures.tsx";
import { captureFacts } from "./web-weave-glow-probe.ts";

const LIVE_BLURS = "data-weave-live-blurs";
const BAKED_BLURS = "data-weave-baked-blurs";
async function readCapture(output: Locator): Promise<z.infer<typeof captureFacts>> {
  return captureFacts.parse(JSON.parse((await output.textContent()) ?? "{}"));
}

for (const dpr of [1, 2]) {
  for (const [length, angle] of [
    [12.234, 0],
    [35.517, 0.71],
    [77.13, 1.7],
  ] as const) {
    test(`warm capture composites preserve caps and alpha at DPR${dpr}, span${length}, angle${angle}`, async ({ mount }) => {
      const component = await mount(<CaptureGlowProbe dpr={dpr} length={length} angle={angle} />);
      const output = component.locator("output");
      await expect(output).not.toHaveText("");
      await expect.poll(async () => (await readCapture(output)).referenceMass).toBeGreaterThan(0);
      await expect.poll(async () => (await readCapture(output)).relativeAlphaError).toBeLessThan(0.03);
      await expect.poll(async () => (await readCapture(output)).alphaRatio).toBeCloseTo(0.5, 1);
      await expect
        .poll(async () => {
          const facts = await readCapture(output);
          return facts.warmComposites / facts.frames;
        })
        .toBe(1);
    });
  }
}

test("palette-owned capture sprites recolor without retaining the previous halo", async ({ mount }) => {
  const component = await mount(<CaptureGlowProbe dpr={2} length={35.517} angle={0.71} />);
  const output = component.locator("output");
  await expect(output).not.toHaveText("");
  const previous = (await readCapture(output)).channels;
  await component.update(<CaptureGlowProbe dpr={2} length={35.517} angle={0.71} palette="var(--color-sky-day)" />);
  await expect.poll(async () => (await readCapture(output)).channels).not.toEqual(previous);
  await expect.poll(async () => (await readCapture(output)).relativeAlphaError).toBeLessThan(0.03);
});

test("capture raster retention evicts cold spans and reuses the rebuilt sprite", async ({ mount }) => {
  const component = await mount(<CaptureGlowProbe dpr={1} length={12.234} angle={0} pressure={true} />);
  const output = component.locator("output");
  await expect(output).not.toHaveText("");
  await expect.poll(async () => (await readCapture(output)).coldAfterPressure).toBe(3);
  await expect.poll(async () => (await readCapture(output)).warmAfterPressure).toBe(0);
});

test("long capture spans keep the exact uncached round-cap painter", async ({ mount }) => {
  const component = await mount(<CaptureGlowProbe dpr={2} length={160} angle={0.71} />);
  const output = component.locator("output");
  await expect(output).not.toHaveText("");
  await expect.poll(async () => (await readCapture(output)).relativeAlphaError).toBe(0);
  await expect
    .poll(async () => {
      const facts = await readCapture(output);
      return facts.warmComposites / facts.frames;
    })
    .toBe(3);
});

test("moving glow reuses baked sprites and rebakes on palette changes", async ({ mount, page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "dark" });
  await page.evaluate(
    ({ live, baked }) => {
      const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "shadowBlur");
      const setBlur = descriptor?.set;
      if (descriptor === undefined || setBlur === undefined) {
        throw new Error("cannot observe canvas blur writes");
      }
      document.documentElement.setAttribute(live, "0");
      document.documentElement.setAttribute(baked, "0");
      Object.defineProperty(CanvasRenderingContext2D.prototype, "shadowBlur", {
        ...descriptor,
        set(this: CanvasRenderingContext2D, value: number): void {
          if (value > 0) {
            const name = this.canvas.isConnected ? live : baked;
            document.documentElement.setAttribute(name, String(Number(document.documentElement.getAttribute(name)) + 1));
          }
          setBlur.call(this, value);
        },
      });
    },
    { live: LIVE_BLURS, baked: BAKED_BLURS },
  );
  const component = await mount(<WeaveBox state="strand-out" wind={1} />);
  const canvas = component.locator("canvas");
  await waitFrames(page, 12);
  await expect(page.locator("html")).toHaveAttribute(LIVE_BLURS, "0");
  await expect(page.locator("html")).toHaveAttribute(BAKED_BLURS, "3");
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        if (!(element instanceof HTMLCanvasElement)) {
          throw new Error("missing weave canvas");
        }
        const ctx = element.getContext("2d");
        if (ctx === null) {
          throw new Error("missing weave context");
        }
        return ctx.getImageData(0, 0, element.width, element.height).data.some((value, index) => index % 4 === 3 && value > 0);
      }),
    )
    .toBe(true);
  await waitFrames(page, 12);
  await expect(page.locator("html")).toHaveAttribute(BAKED_BLURS, "3");
  await page.evaluate(({ name, value }) => document.documentElement.style.setProperty(name, value), {
    name: TOKENS["color.primary"].cssVar,
    value: TOKENS["color.sky-day"].value,
  });
  await waitFrames(page, 3);
  await expect(page.locator("html")).toHaveAttribute(BAKED_BLURS, "6");
  await expect(page.locator("html")).toHaveAttribute(LIVE_BLURS, "0");
  await page.screenshot({ path: testInfo.outputPath("baked-glow.png") });
});
