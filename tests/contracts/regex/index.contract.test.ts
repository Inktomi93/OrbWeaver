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
  updatedAt: 1_760_000_000_000,
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
    // NOT defaulted, deliberately: the edit stamp is a stored column the server always supplies, and a
    // schema default would let a reader silently invent "edited now" for a row it never read one from.
    updatedAt: 1_760_000_000_000,
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

// ── THE GENUINE ST DIALECT (the silent-gap sweep, 2026-08-15) ────────────────────────────────────────────
// Real SillyTavern writes `scriptName` (extensions/regex/index.js:850) and INTEGER placements
// (engine.js:281 — {MD_DISPLAY:0, USER_INPUT:1, AI_OUTPUT:2, SLASH_COMMAND:3, WORLD_INFO:5, REASONING:6}).
// The schema previously read only orb's own export dialect (`name`, string placements), so EVERY genuine
// ST script failed safeParse and the lift dropped it silently — measured on the real corpus: all 15 scripts
// on the Marinara chat-completion preset. The fixtures below are VERBATIM corpus scripts (default-user
// profile, `OpenAI Settings/Marinara's Spaghetti Recipe.json`), not hand-idealized shapes.

/** Verbatim corpus bytes: `extensions.regex_scripts[1]` of the Marinara preset (minDepth non-null!). */
const MARINARA_CLEAN_OPTIONAL = {
  id: "640cca10-b29a-4a48-9328-8d26499b1af7",
  scriptName: "Clean Optional Stuff (Keeping Last)",
  findRegex: "/```\\n[\\s\\S]*?\\n---\\n[\\s\\S]*?```\\n+/g",
  replaceString: "",
  trimStrings: [],
  placement: [1, 2],
  disabled: true,
  markdownOnly: false,
  promptOnly: true,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: 3,
  maxDepth: null,
};

/** Verbatim corpus bytes: `extensions.regex_scripts[2]` — the widest placement set the corpus records. */
const MARINARA_FIX_ELLIPSIS = {
  id: "2f5b7243-6200-4263-9a37-c71dcea01e70",
  scriptName: "Fix Elipsis",
  findRegex: "/\\.{3}/g",
  replaceString: "…",
  trimStrings: [],
  placement: [1, 2, 3, 5, 6],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};

test("a VERBATIM ST script parses: scriptName → name, integer placements → orb members, disabled honoured", () => {
  const parsed = regexScriptCardSchema.parse(MARINARA_CLEAN_OPTIONAL);
  expect(parsed.name).toBe("Clean Optional Stuff (Keeping Last)");
  expect(parsed.placement).toEqual(["USER_INPUT", "AI_OUTPUT"]);
  expect(parsed.enabled).toBe(false);
  expect(parsed.id).toBe("640cca10-b29a-4a48-9328-8d26499b1af7");
  // The ST spellings do not survive into the canonical shape — one home per fact.
  expect(parsed).not.toHaveProperty("scriptName");
  expect(parsed).not.toHaveProperty("minDepth");
});

test("ST's SLASH_COMMAND (3) and legacy sendAs (4) placement NUMBERS drop the MEMBER, never the script", () => {
  const parsed = regexScriptCardSchema.parse(MARINARA_FIX_ELLIPSIS);
  // [1,2,3,5,6] → USER_INPUT, AI_OUTPUT, (3 dropped — no orb slash leg, D107), WORLD_INFO, REASONING.
  expect(parsed.placement).toEqual(["USER_INPUT", "AI_OUTPUT", "WORLD_INFO", "REASONING"]);
  expect(parsed.enabled).toBe(true);
  const withLegacySendAs = { ...MARINARA_FIX_ELLIPSIS, placement: [4, 2] };
  expect(regexScriptCardSchema.parse(withLegacySendAs).placement).toEqual(["AI_OUTPUT"]);
});

test("ST's deprecated MD_DISPLAY (0) maps onto orb's DISPLAY leg", () => {
  const parsed = regexScriptCardSchema.parse({ ...MARINARA_FIX_ELLIPSIS, placement: [0] });
  expect(parsed.placement).toEqual(["DISPLAY"]);
});

test("our `name` wins when both spellings are present (an orb-exported card round-trips exactly)", () => {
  const parsed = regexScriptCardSchema.parse({ ...MARINARA_CLEAN_OPTIONAL, name: "Ours" });
  expect(parsed.name).toBe("Ours");
});

test("the orb string-placement dialect still parses unchanged beside the ST numeric one", () => {
  const parsed = regexScriptCardSchema.parse({ ...FULL_ROW, id: "st-uuid-5" });
  expect(parsed.placement).toEqual(["AI_OUTPUT", "DISPLAY"]);
  expect(parsed.name).toBe(FULL_ROW.name);
});

// ── The kit↔contracts satisfies-seam ───────────────────────────────────
// The pure executor in `@orb/kit/regex` reads a structural `RegexScriptInput`; kit may not import
// contracts, so the persisted row must `satisfies RegexScriptInput` FROM HERE. A field drift
// (rename/retype/widen) makes this assignment tsc-red — that is the whole point of the seam.
test("RegexScriptRow satisfies the kit executor's structural RegexScriptInput", () => {
  const parsed = regexScriptSchema.parse(FULL_ROW);
  const asExecutorInput: RegexScriptInput = parsed satisfies RegexScriptInput;
  expect(asExecutorInput.findRegex).toBe(FULL_ROW.findRegex);
  expect(asExecutorInput.placement).toEqual(FULL_ROW.placement);
});
