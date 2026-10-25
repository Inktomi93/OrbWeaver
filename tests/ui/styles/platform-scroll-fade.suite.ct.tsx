// The scroll fades follow the scroll position through a scroll timeline, with no driver: a box scrolled to its start
// has no top band, a box scrolled past the band's depth has the full band, and a box scrolled to its end has no
// bottom band. Runs on Chromium and on the opt-in webkit-iphone project.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ScrollFadeStory } from "./_scroll-fade-stories.tsx";

const STORY = "tests/ui/styles/_scroll-fade-stories/ScrollFadeStory";

async function band(box: Locator, property: string): Promise<number> {
  return await box.evaluate((el, name) => Number.parseFloat(getComputedStyle(el).getPropertyValue(name)), property);
}

async function scrollTo(box: Locator, axis: "top" | "left", offset: number): Promise<void> {
  await box.evaluate((el, [side, to]) => el.scrollTo({ [side as string]: to as number, behavior: "instant" }), [axis, offset]);
}

test("the vertical fade ramps in from the top and out toward the bottom edge", async ({ mount, page }) => {
  await mount<typeof ScrollFadeStory>(STORY, {});
  const box = page.getByRole("region", { name: "vertical", exact: true });
  // The custom property keeps its unevaluated `round()` text, so the depth is read as the length it resolves to.
  const depth = await box.evaluate((el) => {
    const probe = document.createElement("div");
    probe.style.blockSize = "var(--scroll-fade-depth)";
    el.append(probe);
    const resolved = probe.getBoundingClientRect().height;
    probe.remove();
    return resolved;
  });
  expect(depth).toBeGreaterThan(0);

  await scrollTo(box, "top", 0);
  await expect.poll(() => band(box, "--scroll-fade-top")).toBe(0);
  expect(await band(box, "--scroll-fade-bottom")).toBeCloseTo(depth, 0);

  await scrollTo(box, "top", depth / 2);
  await expect.poll(() => band(box, "--scroll-fade-top")).toBeCloseTo(depth / 2, 0);

  await scrollTo(box, "top", 200);
  await expect.poll(() => band(box, "--scroll-fade-top")).toBeCloseTo(depth, 0);
  expect(await band(box, "--scroll-fade-bottom")).toBeCloseTo(depth, 0);

  await scrollTo(box, "top", 10_000);
  await expect.poll(() => band(box, "--scroll-fade-bottom")).toBe(0);
});

test("the horizontal fade follows the same two edges", async ({ mount, page }) => {
  await mount<typeof ScrollFadeStory>(STORY, {});
  const box = page.getByRole("region", { name: "horizontal", exact: true });
  await scrollTo(box, "left", 0);
  await expect.poll(() => band(box, "--scroll-fade-start")).toBe(0);
  expect(await band(box, "--scroll-fade-end")).toBeGreaterThan(0);
  await scrollTo(box, "left", 10_000);
  await expect.poll(() => band(box, "--scroll-fade-end")).toBe(0);
  expect(await band(box, "--scroll-fade-start")).toBeGreaterThan(0);
});

test("a reduced-motion preference leaves the scroll-linked fade in place", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount<typeof ScrollFadeStory>(STORY, {});
  const box = page.getByRole("region", { name: "vertical", exact: true });
  await scrollTo(box, "top", 10_000);
  await expect.poll(() => band(box, "--scroll-fade-top")).toBeGreaterThan(0);
});
