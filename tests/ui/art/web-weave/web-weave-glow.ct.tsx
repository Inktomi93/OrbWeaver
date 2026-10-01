import { expect, test } from "@playwright/experimental-ct-react";
import { waitFrames } from "../../../support/browser/weave-drive.ts";
import { WeaveBox } from "./web-weave.fixtures.tsx";

const LIVE_BLURS = "data-weave-live-blurs";
const BAKED_BLURS = "data-weave-baked-blurs";

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
  await page.evaluate(() => document.documentElement.style.setProperty("--color-primary", "rgb(20, 150, 240)"));
  await waitFrames(page, 3);
  await expect(page.locator("html")).toHaveAttribute(BAKED_BLURS, "6");
  await expect(page.locator("html")).toHaveAttribute(LIVE_BLURS, "0");
  await page.screenshot({ path: testInfo.outputPath("baked-glow.png") });
});
