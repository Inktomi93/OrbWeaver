// Unit: Tide's per-paragraph splitter (features/chat/lib/split-paragraphs). Pure text transform — the
// blank-line paragraph split, the single-paragraph no-op, the LONG-MESSAGE arm (#212-1) and the leading
// thematic-break drop (#212-5).
//
// THE CAP TEST IS GONE, DELIBERATELY. It pinned `MAX_TRAIN_BUBBLES = 12`: past twelve paragraphs the
// splitter returned null and tide silently rendered as bubble. Measured against real ST-imported prose that
// fired on 69% of assistant turns — i.e. the pin was holding the skin OFF for its own subject. Its
// replacement is the long-message test below, which asserts the opposite property with the same shape.

import { splitIntoTrainParagraphs } from "../../../../../packages/client/src/features/chat/lib/split-paragraphs.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("splits on blank-line breaks, trimming each paragraph", () => {
  const content = "First paragraph.\n\nSecond paragraph.\n\n\nThird, with an extra blank line.";
  expect(splitIntoTrainParagraphs(content)).toEqual(["First paragraph.", "Second paragraph.", "Third, with an extra blank line."]);
});

test("a single-paragraph body doesn't train — null tells the caller to render one bubble", () => {
  expect(splitIntoTrainParagraphs("Just one paragraph, no blank lines.")).toBeNull();
  expect(splitIntoTrainParagraphs("")).toBeNull();
});

test("drops empty paragraphs from leading/trailing/doubled breaks", () => {
  const content = "\n\nFirst.\n\nSecond.\n\n";
  expect(splitIntoTrainParagraphs(content)).toEqual(["First.", "Second."]);
});

// The census that killed the cap (#212-1): the drive chat's assistant turns ran 71/11/15/16/6/16/24/10/44/
// 19/17/4 paragraphs — nine of thirteen over the old 12 limit. A long turn is exactly when the reader
// chose tide, so it trains, at any length.
test("a long-form RP turn trains every paragraph — no silent fallback to one bubble", () => {
  for (const count of [13, 24, 44, 71]) {
    const body = Array.from({ length: count }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    expect(splitIntoTrainParagraphs(body), `${count} paragraphs`).toHaveLength(count);
  }
});

// The orphan pill (#212-5): every ST-imported assistant message opens with `---`, which rendered as an
// `<hr>` in its own 24x17px empty bubble above every trained message.
test("a standalone thematic break is dropped — a train's pill boundary already IS the rule", () => {
  expect(splitIntoTrainParagraphs("---\n\nFirst.\n\nSecond.")).toEqual(["First.", "Second."]);
  expect(splitIntoTrainParagraphs("***\n\nFirst.\n\n___\n\nSecond.")).toEqual(["First.", "Second."]);
  expect(splitIntoTrainParagraphs("- - -\n\nFirst.\n\nSecond.")).toEqual(["First.", "Second."]);
  // …and only a STANDALONE one: a paragraph that merely starts with a dash is content.
  expect(splitIntoTrainParagraphs("--- and then she left\n\nSecond.")).toEqual(["--- and then she left", "Second."]);
  expect(splitIntoTrainParagraphs("-- short rule\n\nSecond.")).toEqual(["-- short rule", "Second."]);
  // A body that is a rule plus ONE paragraph has nothing left to chain ⇒ the single-bubble render.
  expect(splitIntoTrainParagraphs("---\n\nOnly one.")).toBeNull();
});
