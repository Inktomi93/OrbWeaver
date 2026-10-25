// The base-layer element defaults of the platform baseline (docs/plans/css-system/design.md). Runs on Chromium and on the
// opt-in webkit-iphone project.
import { expect, test } from "@playwright/test";
import type { PlatformBaselineStory } from "./_platform-baseline-stories.tsx";

const STORY = "tests/ui/styles/_platform-baseline-stories/PlatformBaselineStory";

test.beforeEach(async ({ mount }) => {
  await mount<typeof PlatformBaselineStory>(STORY, {});
});

test("native controls take the primary colour", async ({ page }) => {
  const read = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-primary)";
    document.body.append(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    return { primary, accent: getComputedStyle(document.querySelector('input[type="checkbox"]') as Element).accentColor };
  });
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
  const offset = await page.getByRole("link", { name: "Read the release notes", exact: true }).evaluate((el) => getComputedStyle(el).textUnderlineOffset);
  expect(offset).not.toBe("auto");
});
