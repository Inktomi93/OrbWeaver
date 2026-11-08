// A class token is whatever CSS calls an identifier, so a non-ASCII class (CodeMirror's style-mod scope classes) is one
// whole token, and an ASCII class beside it keeps its own boundary.
// @subject packages/kit/src/dead-css/index.ts

import { classTokensInSelector } from "@orb/kit/dead-css";
import { expect, test } from "@orb/testkit/node";

const SCOPE = "ͼ";

test("a non-ASCII class reads as one whole token beside its ASCII compound", () => {
  expect(classTokensInSelector(`.${SCOPE}1.cm-focused .cm-line`)).toEqual([`${SCOPE}1`, "cm-focused", "cm-line"]);
  expect(classTokensInSelector(`.cm${SCOPE}x`)).toEqual([`cm${SCOPE}x`]);
});

test("ASCII and escaped class tokens keep their existing reading", () => {
  expect(classTokensInSelector(".a .b\\:c > .d_e-f:hover")).toEqual(["a", "b:c", "d_e-f"]);
  expect(classTokensInSelector("main > [data-slot='x']")).toEqual([]);
});
