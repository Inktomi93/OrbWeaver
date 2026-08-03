import type { RegexScriptCard, RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptBehaviorSchema, regexScriptCardSchema, regexScriptSchema, toRegexScriptCardWire, updateRegexScriptSchema } from "@orb/contracts/regex";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RegexScriptInput } from "@orb/kit/regex";
import { HISTORY_DEPTH_PLACEMENT, MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "../../support/fixtures.ts";

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

// THE ST POLARITY. SillyTavern has no `enabled` field — its editor writes `disabled` and its executor
// skips on `!!script.disabled`. Reading only `enabled` (which defaulted to `true`) turned every parked ST
// script back ON at import: a find/replace its author had deliberately switched off, rewriting canon on the
// first turn after the card landed.
test("an ST card's DISABLED script imports switched off", () => {
  const parsed = regexScriptCardSchema.parse({ id: "st-uuid-2", name: "parked", findRegex: "a", replaceString: "b", placement: [], disabled: true });
  expect(parsed.enabled).toBe(false);
  // The ST key does not survive into the library shape — `enabled` is the one home for the state.
  expect(parsed).not.toHaveProperty("disabled");
});

test("an ST script with neither key is enabled, and OUR `enabled` wins when both are present", () => {
  const base = { id: "st-uuid-3", name: "x", findRegex: "a", replaceString: "b", placement: [] };
  expect(regexScriptCardSchema.parse(base).enabled).toBe(true);
  // An orbweaver-emitted card carries both (see `toRegexScriptCardWire`), so ours must decide — otherwise a
  // re-import of our own export would read the projection instead of the row it was projected from.
  expect(regexScriptCardSchema.parse({ ...base, enabled: true, disabled: false }).enabled).toBe(true);
  expect(regexScriptCardSchema.parse({ ...base, enabled: false, disabled: true }).enabled).toBe(false);
});

test("the emitted card wire carries BOTH keys, agreeing with each other", () => {
  const card = regexScriptCardSchema.parse({ id: "st-uuid-4", name: "x", findRegex: "a", replaceString: "b", placement: [], enabled: false });
  expect(toRegexScriptCardWire(card)).toMatchObject({ enabled: false, disabled: true });
});

test("the CARD wire keeps a foreign client-minted id where the ROW demands a TypeID", () => {
  expect(regexScriptCardSchema.safeParse({ ...FULL_ROW, id: "1a2b3c-not-a-typeid" }).success).toBe(true);
});

// ── The DEPTH-SCOPE PAIRING (the `PROMPT_HISTORY` leg) ──────────────────────────────────────────────────
// `placement` is a SET, so no discriminated union can say "these fields exist only on this placement". The
// contract says it as a TOTAL, TWO-DIRECTIONAL check instead: a depth scope without the leg is a knob that
// governs nothing (D107), and the leg without a scope leaves "the whole history" spelled by ABSENCE.

const HISTORY_ROW: RegexScriptRow = {
  ...FULL_ROW,
  placement: [HISTORY_DEPTH_PLACEMENT],
  historyDepth: { min: 0, max: null },
};

test("a PROMPT_HISTORY script carries its depth scope, and round-trips it", () => {
  expect(regexScriptSchema.parse(HISTORY_ROW)).toEqual(HISTORY_ROW);
  expect(regexScriptSchema.parse({ ...HISTORY_ROW, historyDepth: { min: 2, max: 8 } }).historyDepth).toEqual({ min: 2, max: 8 });
  // The scope survives beside other legs — a script may run on send AND on the assembled history.
  expect(regexScriptSchema.safeParse({ ...HISTORY_ROW, placement: ["USER_INPUT", HISTORY_DEPTH_PLACEMENT] }).success).toBe(true);
});

test("a depth scope on a leg that cannot execute it is REFUSED", () => {
  expect(regexScriptSchema.safeParse({ ...FULL_ROW, historyDepth: { min: 0, max: null } }).success).toBe(false);
  expect(regexScriptSchema.safeParse({ ...FULL_ROW, placement: ["USER_INPUT", "AI_OUTPUT"], historyDepth: { min: 3, max: null } }).success).toBe(false);
});

test("the depth-scoped leg WITHOUT a scope is equally refused — 'everything' is written, never omitted", () => {
  const { historyDepth: _dropped, ...noScope } = HISTORY_ROW;
  expect(regexScriptSchema.safeParse(noScope).success).toBe(false);
});

test("the scope's own bounds are checked: a ceiling shallower than the floor is refused, and the defaults are the whole history", () => {
  expect(regexScriptSchema.safeParse({ ...HISTORY_ROW, historyDepth: { min: 5, max: 2 } }).success).toBe(false);
  expect(regexScriptSchema.safeParse({ ...HISTORY_ROW, historyDepth: { min: -1, max: null } }).success).toBe(false);
  expect(regexScriptSchema.parse({ ...HISTORY_ROW, historyDepth: {} }).historyDepth).toEqual({ min: 0, max: null });
});

test("the depth scope is patchable through the update wire, and the PAIRING is checked on the MERGED body", () => {
  // A patch is not a behavior — it may legitimately name `historyDepth` alone (the placement is unchanged
  // and lives on the stored row), so the wire schema accepts it and `updateScript` re-parses the merge.
  expect(updateRegexScriptSchema.safeParse({ historyDepth: { min: 1, max: 4 } }).success).toBe(true);
  const merged = { findRegex: "a", replaceString: "b", placement: ["USER_INPUT"], historyDepth: { min: 1, max: 4 } };
  expect(regexScriptBehaviorSchema.safeParse(merged).success).toBe(false);
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
