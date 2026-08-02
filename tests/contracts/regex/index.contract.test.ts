import type { RegexScriptCard, RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptCardSchema, regexScriptSchema } from "@orb/contracts/regex";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RegexScriptInput } from "@orb/kit/regex";
import { MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "../../support/fixtures";

const ROW_ID = mintTypeId(ID_PREFIX.regexScript);

// A fully-specified library row (every field present) so `parse` is an identity → round-trip holds.
const FULL_ROW: RegexScriptRow = {
  id: ROW_ID,
  name: "Wrap cat in asterisks",
  findRegex: "\\bcat\\b",
  replaceString: "*cat*",
  placement: ["AI_OUTPUT", "DISPLAY"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: ["the "],
  substituteRegex: SubstituteFindRegex.none,
};

test("parses a fully-specified library row and round-trips byte-for-byte", () => {
  expect(regexScriptSchema.parse(FULL_ROW)).toEqual(FULL_ROW);
});

test("fills the documented defaults when only the required fields are present", () => {
  const minimal = {
    id: ROW_ID,
    name: "Bare",
    findRegex: "\\bfoo\\b",
    replaceString: "bar",
    placement: ["USER_INPUT"],
  };
  expect(regexScriptSchema.parse(minimal)).toEqual({
    ...minimal,
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: SubstituteFindRegex.none,
  });
});

test("rejects a findRegex longer than the kit execution cap (storage cap == execution cap)", () => {
  const overLong = { ...FULL_ROW, findRegex: "a".repeat(MAX_FIND_REGEX_LENGTH + 1) };
  expect(regexScriptSchema.safeParse(overLong).success).toBe(false);
  // The cap boundary itself is accepted.
  const atCap = { ...FULL_ROW, findRegex: "a".repeat(MAX_FIND_REGEX_LENGTH) };
  expect(regexScriptSchema.safeParse(atCap).success).toBe(true);
});

test("a row id must be a regex_script TypeID — a foreign-prefixed or bare id is refused", () => {
  expect(regexScriptSchema.safeParse({ ...FULL_ROW, id: mintTypeId(ID_PREFIX.worldBook) }).success).toBe(false);
  expect(regexScriptSchema.safeParse({ ...FULL_ROW, id: "script_1" }).success).toBe(false);
});

// ── The two ACCEPT-AND-DROP heals at the ST card boundary (D107 dead-switch removals) ────────────────────
// Both are load-bearing as DROPS, not rejections: an ST card that carries a retired value must still
// import its script. A strict enum / strict object would have deleted the whole script instead.

test("an unknown placement member is dropped from the array, not fatal to the script", () => {
  // `SLASH_COMMAND` was a tuple member with ZERO execution legs — struck from `REGEX_PLACEMENTS`.
  const carried = { ...FULL_ROW, placement: ["AI_OUTPUT", "SLASH_COMMAND", "DISPLAY"] };
  const parsed = regexScriptSchema.parse(carried);
  expect(parsed.placement).toEqual(["AI_OUTPUT", "DISPLAY"]);
  expect(REGEX_PLACEMENTS).not.toContain("SLASH_COMMAND");
});

test("the retired minDepth/maxDepth keys are stripped from a carried card script", () => {
  const carried: unknown = {
    id: "st-uuid-1",
    name: "ST script",
    findRegex: "a",
    replaceString: "b",
    placement: ["USER_INPUT"],
    minDepth: 0,
    maxDepth: 4,
  };
  const parsed: RegexScriptCard = regexScriptCardSchema.parse(carried);
  expect(parsed).not.toHaveProperty("minDepth");
  expect(parsed).not.toHaveProperty("maxDepth");
  expect(parsed.id).toBe("st-uuid-1");
});

test("the CARD wire keeps a foreign client-minted id where the ROW demands a TypeID", () => {
  expect(regexScriptCardSchema.safeParse({ ...FULL_ROW, id: "1a2b3c-not-a-typeid" }).success).toBe(true);
});

// ── The kit↔contracts satisfies-seam (Legacy-Migration-and-Gaps.md §6) ───────────────
// The pure executor in `@orb/kit/regex` reads a structural `RegexScriptInput`; kit may not import
// contracts, so the persisted row must `satisfies RegexScriptInput` FROM HERE. A field drift
// (rename/retype/widen) makes this assignment tsc-red — that is the whole point of the seam.
test("RegexScriptRow satisfies the kit executor's structural RegexScriptInput", () => {
  const parsed = regexScriptSchema.parse(FULL_ROW);
  const asExecutorInput: RegexScriptInput = parsed satisfies RegexScriptInput;
  expect(asExecutorInput.findRegex).toBe(FULL_ROW.findRegex);
  expect(asExecutorInput.placement).toEqual(FULL_ROW.placement);
});
