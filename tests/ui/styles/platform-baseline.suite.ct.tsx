// The base-layer element defaults of the platform baseline (docs/law/ui-platform-rulings.md §8.4). Runs on Chromium and on the
// opt-in webkit-iphone project.

import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { PlatformBaselineStory } from "./_platform-baseline-stories.tsx";

const STORY = "tests/ui/styles/_platform-baseline-stories/PlatformBaselineStory";

test.beforeEach(async ({ mount }) => {
  await mount<typeof PlatformBaselineStory>(STORY, {});
});

test("native controls take the primary colour", async ({ page }) => {
  const read = await page.evaluate((colorPrimary) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${colorPrimary})`;
    document.body.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (checkbox === null) {
      throw new Error("The baseline story renders no checkbox");
    }
    return { primary, accent: getComputedStyle(checkbox).accentColor };
  }, TOKENS["color.primary"].cssVar);
  expect(read.accent).toBe(read.primary);
});

test("a heading balances its lines and wraps an unbroken token", async ({ page }) => {
  const heading = page.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCSS("text-wrap-style", "balance");
  await expect(heading).toHaveCSS("overflow-wrap", "break-word");
});

test("controls opt out of double-tap zoom, and a utility class still wins over the default", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Press", exact: true })).toHaveCSS("touch-action", "manipulation");
  await expect(page.getByRole("link", { name: "Read the release notes", exact: true })).toHaveCSS("touch-action", "manipulation");
  await expect(page.getByRole("button", { name: "Pan surface", exact: true })).toHaveCSS("touch-action", "none");
});

test("a link underline sits off the baseline", async ({ page }) => {
  const read = await page.getByRole("link", { name: "Read the release notes", exact: true }).evaluate((el) => {
    const style = getComputedStyle(el);
    return { offset: Number.parseFloat(style.textUnderlineOffset), fontSize: Number.parseFloat(style.fontSize) };
  });
  // `auto` parses to NaN and a zero offset sits on the baseline; only a positive distance, scaled to the type, is off it.
  expect(read.offset / read.fontSize).toBeGreaterThan(0);
});
