// The class names a reply's prose markup uses (`markupClassNames`), which the room's stylesheet cascade keys on: each
// class on an element opener read as Markdown shows it, inline or block, closed or not; none in code, behind an escape,
// inside a text element or in a card.
// @subject packages/kit/src/content/index.ts

import { markupClassNames } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";

const names = (text: string, lenientHtml = false): readonly string[] => [...markupClassNames(text, { lenientHtml })].toSorted();

test.each<readonly [string, string, readonly string[]]>([
  ["a block element's classes, split at any whitespace", '<div class="hud\tpanel  wide">\nHP\n</div>', ["hud", "panel", "wide"]],
  ["an inline element inside a paragraph", 'She <span class="whisper">breathes</span> out.', ["whisper"]],
  ["a single-quoted and a bare value", "<b class='a'>A</b> <i class=b>B</i>", ["a", "b"]],
  ["an opener whose close never arrives", '<section class="open">\nStill open', ["open"]],
  ["a nested element's class beside its parent's", '<div class="outer"><p class="inner">x</p></div>', ["inner", "outer"]],
])("reads %s", (_name, text, expected) => {
  expect(names(text)).toEqual(expected);
});

test.each<readonly [string, string]>([
  ["a code span", 'Write `<span class="sample">x</span>` to mark it.'],
  ["a fenced code block", '```html\n<div class="sample">x</div>\n```'],
  ["an escaped opener", 'A \\<span class="sample">x</span> stays text.'],
  ["a text element's text", '<textarea><b class="sample">x</b></textarea>'],
])("reads no class in %s, though the same markup in prose names one", (_name, text) => {
  expect(names(text)).toEqual([]);
  // Positive control: the sample's own markup, as prose, names its class.
  expect(names('<span class="sample">x</span>')).toEqual(["sample"]);
});

test("a card's markup is not the reply's prose, so its classes are not read", () => {
  const card = ':::card title="Ledger"\n<div class="ledger">Ledger</div>\n:::';
  expect(names(`${card}\n\n<p class="prose">After.</p>`)).toEqual(["prose"]);
});

test("an opener with no class names none", () => {
  expect(names('<div id="x" data-class="y">x</div>')).toEqual([]);
});
