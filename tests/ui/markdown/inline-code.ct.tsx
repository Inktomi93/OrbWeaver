import { expect, test } from "@playwright/test";
import type { InlineCodeStory } from "./_inline-code-stories.tsx";

const STORY = "tests/ui/markdown/_inline-code-stories/InlineCodeStory";

test("inline code carries only classes a stylesheet rule defines, and the fenced block still renders beside it", async ({ mount }) => {
  const component = await mount<typeof InlineCodeStory>(STORY, {
    trust: "trusted",
    mode: "static",
    children: "Run `pnpm test` here.\n\n```ts\nconst answer = 1;\n```",
  });
  const inline = component.locator('code[data-streamdown="inline-code"]');

  await expect(inline).toHaveText("pnpm test");
  // A class no loaded rule selects paints nothing: the vendor spells several on this element.
  const dead = await inline.evaluate((element) => {
    // Tailwind layers its utilities, so a rule can sit inside a grouping rule: walk every nested rule list.
    const selectorsOf = (rules: CSSRuleList): string[] =>
      [...rules].flatMap((rule) => [
        ...("selectorText" in rule ? [String(rule.selectorText)] : []),
        ...("cssRules" in rule ? selectorsOf(rule.cssRules as CSSRuleList) : []),
      ]);
    const selectors = [...document.styleSheets].flatMap((sheet) => selectorsOf(sheet.cssRules));
    return [...element.classList].filter((token) => !selectors.some((text) => text.includes(`.${CSS.escape(token)}`)));
  });
  expect(dead).toEqual([]);
  // Positive control: the fenced branch stays the vendor's and still mounts beside our inline element.
  await expect(component.locator('[data-streamdown="code-block"]')).toBeVisible();
});
