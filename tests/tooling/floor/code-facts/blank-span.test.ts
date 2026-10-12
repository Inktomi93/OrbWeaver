import { blankSpan, blankText } from "../../../../tooling/src/floor/code-facts/blank-span.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("an astral character blanks to two spaces, so the text keeps its UTF-16 length and every later offset", () => {
  const text = "a 👍 b\nc";
  expect(blankText(text)).toBe("      \n ");
  const blanked = blankSpan(text, 0, 6);
  expect(blanked.length).toBe(text.length);
  expect(blanked.indexOf("c")).toBe(text.indexOf("c"));
});
