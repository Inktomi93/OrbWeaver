// @subject packages/client/src/components/row-reveal.ts
import { expect, test } from "@playwright/test";
import type { HoverRevealStory } from "./_hover-reveal-stories.tsx";

const STORY = "tests/client/components/_hover-reveal-stories/HoverRevealStory";
// The text each fragment-wearing child of the story renders.
const LABELS = { row: "row", hidden: "hidden", inert: "inert", pin: "pin" } as const;

// Runs in the browser, so it closes over nothing: the media conditions that gate each rule of a carried class.
function carriedMediaConditions(classes: readonly string[]): string[] {
  const selectors = classes.map((name) => `.${CSS.escape(name)}`);
  const conditions: string[] = [];
  const pending = [...document.styleSheets].map((sheet) => sheet.cssRules);
  for (let rules = pending.shift(); rules !== undefined; rules = pending.shift()) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && rule.parentRule instanceof CSSMediaRule && selectors.some((selector) => rule.selectorText.startsWith(selector))) {
        conditions.push(rule.parentRule.conditionText);
      } else if (rule instanceof CSSGroupingRule) {
        pending.push(rule.cssRules);
      }
    }
  }
  return conditions;
}

test("a hover reveal is gated by hover capability alone, never by pointer size", async ({ mount, page }) => {
  await mount<typeof HoverRevealStory>(STORY, {});
  const carried = await Promise.all(Object.values(LABELS).map((label) => page.getByText(label, { exact: true }).evaluate((el) => [...el.classList])));
  const conditions = await page.evaluate(carriedMediaConditions, carried.flat());
  expect(conditions.length).toBeGreaterThan(0);
  expect(conditions.filter((condition) => condition.includes("pointer"))).toEqual([]);
  expect(conditions.every((condition) => condition.includes("hover"))).toBe(true);
});

test("a mouse hides the clusters at rest and reveals them on the row's hover", async ({ mount, page }) => {
  await mount<typeof HoverRevealStory>(STORY, {});
  await page.mouse.move(600, 600);
  await expect(page.getByText(LABELS.row, { exact: true })).toHaveCSS("opacity", "0");
  await expect(page.getByText(LABELS.hidden, { exact: true })).toHaveCSS("pointer-events", "none");
  await expect(page.getByText(LABELS.inert, { exact: true })).toHaveCSS("pointer-events", "none");
  await expect(page.getByText(LABELS.pin, { exact: true })).toHaveCSS("opacity", "0");
  await page.getByText(LABELS.row, { exact: true }).hover();
  await expect(page.getByText(LABELS.row, { exact: true })).toHaveCSS("opacity", "1");
  await expect(page.getByText(LABELS.inert, { exact: true })).toHaveCSS("pointer-events", "auto");
});

test.describe("a touch device that cannot hover", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("keeps every cluster revealed and live", async ({ mount, page }) => {
    await mount<typeof HoverRevealStory>(STORY, {});
    await expect(page.getByText(LABELS.row, { exact: true })).toHaveCSS("opacity", "1");
    await expect(page.getByText(LABELS.hidden, { exact: true })).toHaveCSS("opacity", "1");
    await expect(page.getByText(LABELS.hidden, { exact: true })).toHaveCSS("pointer-events", "auto");
    await expect(page.getByText(LABELS.inert, { exact: true })).toHaveCSS("pointer-events", "auto");
    await expect(page.getByText(LABELS.pin, { exact: true })).toHaveCSS("opacity", "0.4");
  });
});
