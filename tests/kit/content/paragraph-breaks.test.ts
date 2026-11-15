// A reply splits into paragraphs only at a blank-line run that ends a Markdown paragraph: never inside a stylesheet,
// a script, a code block, an element that closes, a card, a choice set or a hidden span.
// @subject packages/kit/src/content/index.ts

import { paragraphBreaks } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

function paragraphsOf(content: string): readonly string[] {
  const breaks = paragraphBreaks(content);
  return [...breaks, { start: content.length, end: content.length }].map((cut, index) => content.slice(breaks[index - 1]?.end ?? 0, cut.start));
}

const PANEL = '<div class="hud"><style>.hud{color:red}\n\n.hud b{margin:0}</style><b>HUD</b></div>';

test.each([
  ["plain paragraphs", "One.\n\nTwo.\n\n\nThree.", ["One.", "Two.", "Three."]],
  ["a stylesheet holding a blank line", `Intro.\n\n${PANEL}\n\nAfter.`, ["Intro.", PANEL, "After."]],
  ["a script holding a blank line", "<script>let a = 1;\n\nlet b = 2;</script>\n\nAfter.", ["<script>let a = 1;\n\nlet b = 2;</script>", "After."]],
  ["a tick fence holding a blank line", "Sample:\n\n```css\n.a{}\n\n.b{}\n```\n\nAfter.", ["Sample:", "```css\n.a{}\n\n.b{}\n```", "After."]],
  ["a tilde fence holding a blank line", "~~~\n<div>\n\n</div>\n~~~\n\nAfter.", ["~~~\n<div>\n\n</div>\n~~~", "After."]],
  ["indented code holding a blank line", "Sample:\n\n    a = 1\n\n    b = 2\n\nAfter.", ["Sample:", "    a = 1\n\n    b = 2", "After."]],
  ["a fence in a list item", "- item\n\n  ```\n  a\n\n  b\n  ```\n\nAfter.", ["- item", "  ```\n  a\n\n  b\n  ```", "After."]],
  [
    "an element that closes past blank lines",
    "<details>\n<summary>S</summary>\n\nInside.\n\n</details>\n\nAfter.",
    ["<details>\n<summary>S</summary>\n\nInside.\n\n</details>", "After."],
  ],
  ["an element that never closes", "<div>\n\nInside.", ["<div>", "Inside."]],
  ["a card", ':::card title="T"\nOne line.\n\nAnother.\n:::\n\nAfter.', [':::card title="T"\nOne line.\n\nAnother.\n:::', "After."]],
  ["a choice set", "Pick:\n\n:::choices\n1. Left\n\n2. Right\n:::\n\nAfter.", ["Pick:", ":::choices\n1. Left\n\n2. Right\n:::", "After."]],
  ["a hidden span", 'Seen.\n\n<lie truth="one\n\ntwo"/>\n\nAfter.', ["Seen.", '<lie truth="one\n\ntwo"/>', "After."]],
  [
    "a hidden span that forms once another is stripped",
    'Seen.\n\n<l<lie truth="x"/>ie truth="one\n\ntwo"/>\n\nAfter.',
    ["Seen.", '<l<lie truth="x"/>ie truth="one\n\ntwo"/>', "After."],
  ],
  ["a stylesheet that never closes", "Intro.\n\n<style>.a{}\n\n.b{}", ["Intro.", "<style>.a{}\n\n.b{}"]],
  ["a fence that opens with a blank line", "```\n\na\n```\n\nAfter.", ["```\n\na\n```", "After."]],
  ["a lenient card run, which ends at its blank line", "<section>\n<p>a</p>\n<p>b</p>\n\n<p>c</p>", ["<section>\n<p>a</p>\n<p>b</p>", "<p>c</p>"]],
  ["a tick run the blank line ends", "a `b\n\nc` d", ["a `b", "c` d"]],
  ["a style sample in a fence, then a panel", `\`\`\`\n<style>\n\n</style>\n\`\`\`\n\n${PANEL}`, ["```\n<style>\n\n</style>\n```", PANEL]],
])("%s", (_name, content, expected) => {
  expect(paragraphsOf(content)).toEqual(expected);
});

test("a reply of many units and blank lines splits in linear time", () => {
  const body = `${PANEL}\n\n\`\`\`\na\n\nb\n\`\`\`\n\n<div>\n\nx</div>\n\n`.repeat(4000);
  const started = performance.now();
  // Three breaks a unit, less the blank lines that end the reply, which no paragraph follows.
  expect(paragraphBreaks(body)).toHaveLength(4000 * 3 - 1);
  expect(performance.now() - started).toBeLessThan(1000);
});
