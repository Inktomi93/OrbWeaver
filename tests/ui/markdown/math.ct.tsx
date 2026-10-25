import { expect, test } from "@playwright/test";
import type { MathStory } from "./_math-stories.tsx";

const STORY = "tests/ui/markdown/_math-stories/MathStory";

for (const trust of ["trusted", "untrusted"] as const) {
  test(`${trust} Markdown renders inline and display math with its actual stylesheet and font`, async ({ mount }) => {
    const component = await mount<typeof MathStory>(STORY, {
      trust,
      mode: "static",
      children: String.raw`Inline $x^2$.

$$
\frac{1}{2}
$$`,
    });
    await expect(component.locator(".katex-html")).toHaveCount(2);
    await expect(component.locator(".katex-html").first()).toBeVisible();
    await expect(component.locator(".katex-display")).toBeVisible();
    await expect(component.locator(".katex").first()).toHaveCSS("font-family", /KaTeX_Main/u);
    const fonts = await component.evaluate(async () => (await document.fonts.load("16px KaTeX_Main")).map((face) => face.status));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((status) => status === "loaded")).toBe(true);
  });

  test(`${trust} Markdown keeps surrounding prose when an equation is invalid`, async ({ mount }) => {
    const component = await mount<typeof MathStory>(STORY, {
      trust,
      mode: "static",
      children: String.raw`Before the equation.

$$
\frac{1}{
$$

After the equation.`,
    });
    await expect(component.locator(".katex-error")).toBeVisible();
    await expect(component).toContainText("Before the equation.");
    await expect(component).toContainText("After the equation.");
    await expect(component.getByText("Content failed to render.", { exact: true })).toHaveCount(0);
  });
}

// Runs in the browser, so it closes over nothing: an explicit stack replaces recursion.
function katexPlacement(): { readonly order: readonly string[]; readonly katexLayers: readonly string[] } {
  const order: string[] = [];
  const katexLayers: string[] = [];
  const pending: { rules: CSSRuleList; layer: string | null }[] = [...document.styleSheets].map((sheet) => ({ rules: sheet.cssRules, layer: null }));
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    for (const rule of next.rules) {
      if (rule instanceof CSSLayerStatementRule) {
        order.push(...rule.nameList);
      } else if (rule instanceof CSSLayerBlockRule) {
        order.push(rule.name);
        pending.push({ rules: rule.cssRules, layer: rule.name });
      } else if (rule instanceof CSSStyleRule && rule.selectorText.startsWith(".katex")) {
        katexLayers.push(next.layer ?? "(unlayered)");
      }
    }
  }
  return { order: [...new Set(order)], katexLayers };
}

// A vendor sheet must lose to every house layer without `!important`, yet beat preflight, whose `border: 0 solid`
// reset would erase the borders KaTeX draws its fraction rules and radicals with.
test("the KaTeX stylesheet ranks in the vendor layer, above base and below the first house layer", async ({ mount, page }) => {
  await mount<typeof MathStory>(STORY, { trust: "trusted", mode: "static", children: String.raw`$\frac{1}{2}$` });
  const placement = await page.evaluate(katexPlacement);
  expect(new Set(placement.katexLayers)).toEqual(new Set(["vendor"]));
  expect(placement.order.indexOf("base")).toBeLessThan(placement.order.indexOf("vendor"));
  expect(placement.order.indexOf("vendor")).toBeLessThan(placement.order.indexOf("ui"));
});
