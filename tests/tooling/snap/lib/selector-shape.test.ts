// @instrument-proof: the predicate behind snap's unmatchable-selector refusal (#550). The lie it ends:
// `--wait-for 'choose who speaks next'` parsed as a CSS type-selector chain, matched nothing forever, and
// reported a 10s timeout that read exactly like "the text is not rendered". BOTH directions are pinned —
// prose REFUSES, and every real selector shape (including the ones a false-positive predicate would eat:
// `nav a`, `:has(a b)`, quoted attribute values, custom elements, `text=`) passes untouched.
import { OPTIONAL_SELECTOR_FLAGS, SELECTOR_VALUE_FLAGS, selectorRefusalForFlag, unmatchableSelectorRefusal } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// lib/ cannot import ops/, so selector-shape.ts RESTATES the optional-inline-selector flags. This is the
// enforcer for that restatement: a fifth optional-selector flag added to ops/flags.ts without a row in
// SELECTOR_VALUE_FLAGS would silently reopen the hole for exactly the flags whose values skip
// validateFlagValue entirely.
test("every optional-inline-selector flag is inside the judged population", () => {
  expect([...OPTIONAL_SELECTOR_FLAGS].filter((flag) => !SELECTOR_VALUE_FLAGS.has(flag))).toEqual([]);
});

test("the pair flags are judged on their HEAD only, and a bare --key is not a selector at all", () => {
  expect(selectorRefusalForFlag("--expect-text", "Save changes=done")).toContain('--expect-text "text=Save changes"');
  // The VALUE half is free text and must never be judged: `#result=Fetch and add` is a live idiom.
  expect(selectorRefusalForFlag("--expect-text", "#result=Fetch and add")).toBeNull();
  expect(selectorRefusalForFlag("--key", "Tab")).toBeNull();
  expect(selectorRefusalForFlag("--goto", "modal:newChat")).toBeNull();
  expect(selectorRefusalForFlag("--eval", "document.title")).toBeNull();
});

test("a bare prose phrase is REFUSED with the text= spelling the caller meant", () => {
  const refusal = unmatchableSelectorRefusal("--wait-for", "choose who speaks next");

  expect(refusal).toContain("can never match");
  expect(refusal).toContain('"choose", "who", "speaks", "next"');
  expect(refusal).toContain('--wait-for "text=choose who speaks next"');
});

test("a SINGLE bogus word is refused too — a one-word tag that cannot exist never matches either", () => {
  const refusal = unmatchableSelectorRefusal("--click", "Delete");

  expect(refusal).toContain("is not an element name");
  expect(refusal).toContain('--click "text=Delete"');
});

// The false-refusal direction is the one that would make this predicate WORSE than the lie: every entry
// here is a selector a real snap run uses, and a table short by one element name reds a working command.
test.each([
  ["nav a", "a descendant chain of two real element names"],
  ["ul li", "the other everyday descendant chain"],
  ["html body main section", "a four-deep chain of real elements"],
  ["feGaussianBlur", "an SVG filter primitive, camelCase"],
  ["orb-widget", "a custom element (hyphenated per spec)"],
  ["h1 > span.title", "a mixed chain with a class"],
  ['[aria-label="Open chat"]', "an attribute value carrying a SPACE"],
  ['button[aria-label="Save changes"] span', "a space inside quotes plus a real trailing tag"],
  ["div:has(a b)", "a functional pseudo-class whose argument holds a combinator"],
  ["#settings-anchor-admin-memory-tuning", "an id"],
  ['[data-testid="composer-guided-response"]', "the testid form snap runs constantly"],
  ["text=choose who speaks next", "the text engine — prose is the POINT there"],
  ["css=nav a", "an explicit css= engine prefix"],
  ["//button[1]", "XPath shorthand"],
  ["text=Save >> nth=0", "an engine chain"],
  ["", "an empty value (a different error owns that)"],
])("passes %j untouched — %s", (selector) => {
  expect(unmatchableSelectorRefusal("--wait-for", selector)).toBeNull();
});
