import { expect, test } from "@playwright/experimental-ct-react";
import { pixelExtremaContrast } from "../../../support/browser/pixel-contrast.ts";
import { JumpingStickyList } from "./list-window.fixtures.tsx";

test("instant jumps recompute the top fade after the new sticky rows render", async ({ mount, page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const component = await mount(<JumpingStickyList />);
  const scroller = component.locator('[data-slot="message-list-scroll"]');
  await expect(component.getByTestId("speaker-23")).toBeVisible();
  await expect.poll(async () => (await pixelExtremaContrast(page, component.getByTestId("contrast-control"))).ratio).toBeGreaterThanOrEqual(4.5);

  for (const index of [2, 17, 5, 20, 9, 1]) {
    await scroller.evaluate((element, row) => {
      const viewport = element.querySelector('[data-slot="message-list-viewport"]');
      if (!(viewport instanceof HTMLElement)) {
        throw new Error("missing virtual viewport");
      }
      const stride = (viewport.offsetHeight - 800) / 23;
      element.scrollTop = row * stride + 160;
    }, index);
    const speaker = component.getByTestId(`speaker-${index}`);
    await expect(speaker).toBeVisible();
    await expect
      .poll(() =>
        speaker.evaluate((element) => {
          const scroll = element.closest('[data-slot="message-list-scroll"]');
          const header = element.closest("[data-sticky]");
          if (scroll === null || header === null) {
            throw new Error("missing scrollport or sticky header");
          }
          return Math.abs(header.getBoundingClientRect().top - scroll.getBoundingClientRect().top);
        }),
      )
      .toBeLessThan(1);
    await expect(scroller).not.toHaveAttribute("data-fade-top");
    await expect.poll(async () => (await pixelExtremaContrast(page, speaker)).ratio).toBeGreaterThanOrEqual(4.5);
    await scroller.evaluate((element, row) => {
      const viewport = element.querySelector('[data-slot="message-list-viewport"]');
      if (!(viewport instanceof HTMLElement)) {
        throw new Error("missing virtual viewport");
      }
      element.scrollTop = row * ((viewport.offsetHeight - 800) / 23) - 6;
    }, index);
    await expect
      .poll(() =>
        scroller.evaluate((element) => {
          const top = element.getBoundingClientRect().top;
          return [...element.querySelectorAll("[data-sticky]")].some((header) => {
            const box = header.getBoundingClientRect();
            return box.top <= top + 1 && box.bottom > top;
          });
        }),
      )
      .toBe(false);
    await expect(scroller).toHaveAttribute("data-fade-top", "");
  }
});
