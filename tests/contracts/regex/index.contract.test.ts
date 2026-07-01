import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { RegexScriptInput } from "@orb/kit/regex";
import { MAX_FIND_REGEX_LENGTH, SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "vitest";

// A fully-specified script (every field present) so `parse` is an identity → round-trip holds.
const FULL_SCRIPT: RegexScript = {
  id: "script_1",
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
  minDepth: null,
  maxDepth: null,
};

test("parses a fully-specified script and round-trips byte-for-byte", () => {
  expect(regexScriptSchema.parse(FULL_SCRIPT)).toEqual(FULL_SCRIPT);
});

test("fills the documented defaults when only the required fields are present", () => {
  const minimal = {
    id: "script_2",
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
    minDepth: null,
    maxDepth: null,
  });
});

test("rejects a findRegex longer than the kit execution cap (storage cap == execution cap)", () => {
  const overLong = { ...FULL_SCRIPT, findRegex: "a".repeat(MAX_FIND_REGEX_LENGTH + 1) };
  expect(regexScriptSchema.safeParse(overLong).success).toBe(false);
  // The cap boundary itself is accepted.
  const atCap = { ...FULL_SCRIPT, findRegex: "a".repeat(MAX_FIND_REGEX_LENGTH) };
  expect(regexScriptSchema.safeParse(atCap).success).toBe(true);
});

test("rejects an unknown placement value", () => {
  const bad = { ...FULL_SCRIPT, placement: ["NOT_A_PLACEMENT"] };
  expect(regexScriptSchema.safeParse(bad).success).toBe(false);
});

// ── The kit↔contracts satisfies-seam (Legacy-Migration-and-Gaps.md §6) ───────────────
// The pure executor in `@orb/kit/regex` reads a structural `RegexScriptInput`; kit may not import
// contracts, so the persisted `RegexScript` must `satisfies RegexScriptInput` FROM HERE. A field drift
// (rename/retype/widen) makes this assignment tsc-red — that is the whole point of the seam.
test("RegexScript satisfies the kit executor's structural RegexScriptInput", () => {
  const parsed = regexScriptSchema.parse(FULL_SCRIPT);
  const asExecutorInput: RegexScriptInput = parsed satisfies RegexScriptInput;
  expect(asExecutorInput.findRegex).toBe(FULL_SCRIPT.findRegex);
  expect(asExecutorInput.placement).toEqual(FULL_SCRIPT.placement);
});
