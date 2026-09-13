import { readTailwindClassToken, readTailwindClassTokens } from "../../../../tooling/src/verify/lib/tailwind-class-token.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("class token parsing preserves arbitrary-variant colons and normalizes both important spellings", () => {
  expect(readTailwindClassToken("pointer-fine:[&:hover]:!hidden")).toEqual({
    token: "pointer-fine:[&:hover]:!hidden",
    offset: 0,
    variants: ["pointer-fine", "[&:hover]"],
    terminal: "!hidden",
    utility: "hidden",
  });
  expect(readTailwindClassToken("focus:size-avatar-md!")).toMatchObject({
    variants: ["focus"],
    terminal: "size-avatar-md!",
    utility: "size-avatar-md",
  });
});

test("literal token offsets retain repeated-token positions in the enclosing node", () => {
  expect(readTailwindClassTokens('"  rounded-lg rounded-lg"')).toMatchObject([
    { token: "rounded-lg", offset: 3 },
    { token: "rounded-lg", offset: 14 },
  ]);
});

test("template heads, middles and tails preserve complete tokens beside substitutions", () => {
  expect(readTailwindClassTokens("`md:flex-row${")).toMatchObject([{ token: "md:flex-row", offset: 1 }]);
  expect(readTailwindClassTokens("} pointer-coarse:hidden${")).toMatchObject([{ token: "pointer-coarse:hidden", offset: 2 }]);
  expect(readTailwindClassTokens("} lg:hidden`")).toMatchObject([{ token: "lg:hidden", offset: 2 }]);
  expect(readTailwindClassTokens("`${")).toEqual([]);
  expect(readTailwindClassTokens('"md:flex-row"')).toMatchObject([{ token: "md:flex-row", offset: 1 }]);
});
