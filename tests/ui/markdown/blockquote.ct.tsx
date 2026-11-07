import { expect, test } from "@playwright/test";
import type { BlockquoteStory } from "./_blockquote-stories.tsx";

const STORY = "tests/ui/markdown/_blockquote-stories/BlockquoteStory";

test("a blockquote carries only classes a stylesheet rule defines and still draws its rule and indent", async ({ mount }) => {
  const component = await mount<typeof BlockquoteStory>(STORY, { trust: "trusted", mode: "static", children: "> She said nothing.\n\nAfter the quote." });
  const quote = component.locator('blockquote[data-streamdown="blockquote"]');
  await expect(quote).toContainText("She said nothing.");
  // A class no loaded rule selects paints nothing: the vendor spells several on this element.
  const dead = await quote.evaluate((element) => {
    // Tailwind layers its utilities, so a rule can sit inside a grouping rule: walk every nested rule list.
    const selectorsOf = (rules: CSSRuleList): string[] =>
      [...rules].flatMap((rule) => [
        ...(rule instanceof CSSStyleRule ? [rule.selectorText] : []),
        ...(rule instanceof CSSGroupingRule ? selectorsOf(rule.cssRules) : []),
      ]);
    const selectors = [...document.styleSheets].flatMap((sheet) => selectorsOf(sheet.cssRules));
    return [...element.classList].filter((token) => !selectors.some((text) => text.includes(`.${CSS.escape(token)}`)));
  });
  expect(dead).toEqual([]);
  // Positive control: the quote is still told apart from narration by its rule and indent.
  const painted = await quote.evaluate((element) => {
    const style = getComputedStyle(element);
    return { rule: Number.parseFloat(style.borderInlineStartWidth), indent: Number.parseFloat(style.paddingInlineStart), slant: style.fontStyle };
  });
  expect(painted.rule).toBeGreaterThan(0);
  expect(painted.indent).toBeGreaterThan(0);
  expect(painted.slant).toBe("italic");
});
