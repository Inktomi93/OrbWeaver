// Unit: Tide's per-paragraph splitter (features/chat/lib/split-paragraphs). Pure text transform — the
// blank-line paragraph split, the single-paragraph no-op, and the messiness-guard cap (§B.2).

import {
  MAX_TRAIN_BUBBLES,
  splitIntoTrainParagraphs,
} from "../../../../../packages/client/src/features/chat/lib/split-paragraphs";
import { expect, test } from "../../../../support/fixtures";

test("splits on blank-line breaks, trimming each paragraph", () => {
  const content = "First paragraph.\n\nSecond paragraph.\n\n\nThird, with an extra blank line.";
  expect(splitIntoTrainParagraphs(content)).toEqual([
    "First paragraph.",
    "Second paragraph.",
    "Third, with an extra blank line.",
  ]);
});

test("a single-paragraph body doesn't train — null tells the caller to render one bubble", () => {
  expect(splitIntoTrainParagraphs("Just one paragraph, no blank lines.")).toBeNull();
  expect(splitIntoTrainParagraphs("")).toBeNull();
});

test("drops empty paragraphs from leading/trailing/doubled breaks", () => {
  const content = "\n\nFirst.\n\nSecond.\n\n";
  expect(splitIntoTrainParagraphs(content)).toEqual(["First.", "Second."]);
});

test("past MAX_TRAIN_BUBBLES falls back to null (the messiness guard)", () => {
  const tooMany = Array.from({ length: MAX_TRAIN_BUBBLES + 1 }, (_, i) => `Paragraph ${i}.`).join(
    "\n\n",
  );
  expect(splitIntoTrainParagraphs(tooMany)).toBeNull();
  const atCap = Array.from({ length: MAX_TRAIN_BUBBLES }, (_, i) => `Paragraph ${i}.`).join("\n\n");
  expect(splitIntoTrainParagraphs(atCap)).toHaveLength(MAX_TRAIN_BUBBLES);
});
