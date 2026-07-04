// Unit: the stored-body → render-block projection (features/chat/lib/content-blocks). Pure, no DOM —
// runs in the node lane. Asserts the compose of the kit tokenizer + the contracts projector.

import { toContentBlocks } from "../../../../../packages/client/src/features/chat/lib/content-blocks";
import { expect, test } from "../../../../support/fixtures";

test("plain text projects to a single markdown block", () => {
  expect(toContentBlocks("hello world")).toEqual([{ kind: "markdown", md: "hello world" }]);
});

test("empty content projects to no blocks", () => {
  expect(toContentBlocks("")).toEqual([]);
});

test("an external image splits into markdown + media + markdown blocks (exhaustive kinds)", () => {
  expect(toContentBlocks("see ![cat](https://x.test/c.png) end")).toEqual([
    { kind: "markdown", md: "see " },
    {
      kind: "media",
      media: "image",
      src: { kind: "external", url: "https://x.test/c.png" },
      alt: "cat",
    },
    { kind: "markdown", md: " end" },
  ]);
});
