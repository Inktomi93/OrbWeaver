// lib/example-messages — the §6.3 exampleMessages DISPLAY parser (browser-free unit test, Spine-Testing.md
// §7): the `<START>`-block split for the read-only formatted mini-transcript. DISPLAY only — the write path
// keeps the raw string byte-identical, so this is never asked to reconstruct the original.

// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the character-list-view.test.ts precedent).
import { parseExampleBlocks } from "../../../../../packages/client/src/features/character/lib/example-messages";
import { expect, test } from "../../../../support/fixtures";

const USER = "{{user}}";
const CHAR = "{{char}}";

test("parseExampleBlocks: splits a multi-block string on <START>, trimming each block", () => {
  const raw = `<START>\n${USER}: hi\n${CHAR}: hello\n<START>\n${USER}: bye\n${CHAR}: farewell`;
  expect(parseExampleBlocks(raw)).toEqual([
    `${USER}: hi\n${CHAR}: hello`,
    `${USER}: bye\n${CHAR}: farewell`,
  ]);
});

test("parseExampleBlocks: treats a marker-less string as one block", () => {
  expect(parseExampleBlocks(`${USER}: hi\n${CHAR}: hello`)).toEqual([
    `${USER}: hi\n${CHAR}: hello`,
  ]);
});

test("parseExampleBlocks: matches the delimiter case-insensitively", () => {
  expect(parseExampleBlocks("<start>one<Start>two")).toEqual(["one", "two"]);
});

test("parseExampleBlocks: drops empty/whitespace-only segments (leading marker, blank input)", () => {
  expect(parseExampleBlocks("<START>only")).toEqual(["only"]);
  expect(parseExampleBlocks("")).toEqual([]);
  expect(parseExampleBlocks("   \n  ")).toEqual([]);
});
