// Contract pins for @orb/contracts/refinery (R0 — docs/history/design/refinery-r0.md): the F3 fixed stage
// payloads round-trip parse-is-identity; the F4 mode / verdict / status axes are closed; the score
// bounds + the rewrite-text card-cap twin hold at the zod belt (the layer the per-wire scrubs cannot
// lose); the run view discriminates payload BY stage; and REFINABLE_FIELDS ⊆ CharacterCard — the pin
// that CANNOT live in the refinery namespace itself (its header forbids `#character` imports to keep
// the character→refinery edge one-way), so it lives here, where both namespaces are importable.

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardSchema } from "@orb/contracts/character";
import type { RefineryAnalyzePayload, RefineryRewritePayload, RefineryScorePayload } from "@orb/contracts/refinery";
import {
  appendedRewrites,
  DEFAULT_REFINERY_STAGE_CONFIG,
  GREETING_SLOTS_MAX,
  isAppendedRewrite,
  isClearedRewrite,
  payloadSchemaFor,
  REFINABLE_FIELDS,
  REFINERY_STAGE_PAYLOADS,
  REFINERY_STAGES,
  refineryAnalyzePayloadSchema,
  refineryCustomRunConfigSchema,
  refineryCustomStageConfigSchema,
  refineryGuidanceSchema,
  refineryRewritePayloadSchema,
  refineryRunSchema,
  refineryScorePayloadSchema,
  refinerySelectionPatchSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionSummarySchema,
  refineryStageConfigSchema,
} from "@orb/contracts/refinery";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
// The PRODUCTION estimator the contract's token cap is measured by — imported so the fixtures below assert
// their own token count instead of assuming it (a fixture that is not really at-cap proves nothing).
import { estimateTokens } from "@orb/kit/tokens";
import { expectTypeOf } from "vitest";
import type { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

// The 1-10 rubric's probe values + the card TEXT_MAX twin (contracts/character caps text fields at
// 100 000 — an applied rewrite must satisfy `character.update`, so the payload pins the same cap).
const SCORE_BELOW_MIN = 0;
const SCORE_ABOVE_MAX = 11;
const CARD_TEXT_MAX = 100_000;
const CREATED_AT = 1_700_000_000_000;
const UPDATED_AT = 1_700_100_000_000;

// The model-authored-payload ceilings (security pass 2026-08-08 — docs/reviews/security/
// 2026-08-08-refinery-r0-security-pass.md gap 1). The constants are unexported in the contract, so every
// one is pinned BEHAVIORALLY at-cap/over-cap, the REWRITE_TEXT_MAX precedent above.
//
// CRITIQUE PROSE IS DUAL-BOUND (owner ruling 2026-08-08 — "we are thinking in chars but it needs to be
// tokens ... I have cards that are like 4k"): a 4 000-TOKEN product cap measured by the ONE production
// estimator (`@orb/kit/tokens`), plus a derived CHAR backstop. Both are pinned behaviorally here.
const CRITIQUE_TOKEN_MAX = 4000;
// 4 × the token cap. QuadChars charges a printable-ASCII run 1 token per 4 chars and every other codepoint
// 1 token, so 4 is the MOST chars a token can ever buy — which makes this the exact char envelope of the
// token cap (it rejects nothing the token cap accepts) rather than an independent number.
const CRITIQUE_CHAR_BACKSTOP = CRITIQUE_TOKEN_MAX * 4;
const NOTE_MAX = 500;
const LIST_MAX = 50;
const ENTRIES_MAX = 108;
const GREETING_INDEX_MAX = 99;
const GUIDANCE_MAX = 4000;
const SESSION_NAME_MAX = 200;
// The card ceiling the two greeting-addressed caps are twins of (characterCardSchema.greetings).
const CARD_GREETINGS_MAX = 100;

// Canonical typeid suffix (valid crockford base32) — deterministic fixtures, no minting in tests.
const SESSION_ID = "refinery_session_01h455vb4pex5vsknk084sn02q";
const RUN_ID = "refinery_run_01h455vb4pex5vsknk084sn02q";
const CHARACTER_ID = "character_01h455vb4pex5vsknk084sn02q";

test("payloadSchemaFor preserves fixed-stage and embedded-custom schema inference", () => {
  const fixed = payloadSchemaFor("score", { kind: "fixed", mode: "full" });
  expectTypeOf<z.output<typeof fixed>>().toEqualTypeOf<RefineryScorePayload>();
  expect(fixed).toBe(REFINERY_STAGE_PAYLOADS.score);

  const custom = payloadSchemaFor("score", {
    kind: "custom",
    schemaId: mintTypeId(ID_PREFIX.refinerySchema),
    schemaVersion: 1,
    schema: { type: "object", properties: { note: { type: "string" } } },
  });
  expectTypeOf(custom).toMatchTypeOf<z.ZodObject>();
  expect(custom.safeParse({ note: "kept verbatim" }).success).toBe(true);
});

test("custom stage schema ids reject malformed and wrong-prefix TypeIDs", () => {
  const schemaId = mintTypeId(ID_PREFIX.refinerySchema);
  const wrongPrefix = mintTypeId(ID_PREFIX.refineryRun);
  expect(refineryCustomStageConfigSchema.safeParse({ kind: "custom", schemaId }).success).toBe(true);
  expect(refineryCustomStageConfigSchema.safeParse({ kind: "custom", schemaId: wrongPrefix }).success).toBe(false);
  expect(refineryCustomStageConfigSchema.safeParse({ kind: "custom", schemaId: "refinery_schema_not-a-typeid" }).success).toBe(false);
  const run = { kind: "custom", schemaId, schemaVersion: 1, schema: {} } as const;
  expect(refineryCustomRunConfigSchema.safeParse(run).success).toBe(true);
  expect(refineryCustomRunConfigSchema.safeParse({ ...run, schemaId: wrongPrefix }).success).toBe(false);
  expect(refineryCustomRunConfigSchema.safeParse({ ...run, schemaId: "refinery_schema_not-a-typeid" }).success).toBe(false);
});

const SCORE_PAYLOAD: RefineryScorePayload = {
  fieldScores: [
    { field: "description", score: 7, strengths: "vivid imagery", weaknesses: "runs long", suggestions: "trim the second paragraph" },
    // Per-greeting granularity (P3): `greetingIndex` present ⇔ field === "greetings".
    { field: "greetings", greetingIndex: 1, score: 6, strengths: "warm", weaknesses: "generic opener", suggestions: "anchor it in the scenario" },
  ],
  overallScore: 6.5,
  priorityImprovements: ["tighten description", "differentiate greetings"],
  summary: "A solid base with generic edges.",
};

const REWRITE_PAYLOAD: RefineryRewritePayload = {
  fields: [
    { field: "description", text: "A meticulous keeper of records, dry-humoured and exact." },
    { field: "greetings", greetingIndex: 1, text: "Back again? The stacks missed you." },
  ],
};

const ANALYZE_PAYLOAD: RefineryAnalyzePayload = {
  preserved: ["dry humour", "archivist diction"],
  lost: [],
  gained: ["a concrete daily routine"],
  soulScore: 9,
  soulAssessment: "Still unmistakably the same character.",
  verdict: "NEEDS_REFINEMENT",
  issues: ["the scenario now contradicts greeting 0"],
  recommendations: ["reconcile the scenario with the first greeting"],
};

// ── The F3 payloads round-trip parse-is-identity ────────────────────────────────────────────────────────

test("the score payload round-trips (per-field prose strings, per-greeting index, weighted overall)", () => {
  expect(refineryScorePayloadSchema.parse(SCORE_PAYLOAD)).toEqual(SCORE_PAYLOAD);
});

test("the rewrite payload round-trips (typed fields — the markdown-reparse killer)", () => {
  expect(refineryRewritePayloadSchema.parse(REWRITE_PAYLOAD)).toEqual(REWRITE_PAYLOAD);
});

test("the analyze payload round-trips (verdict enum + 1-10 soul check)", () => {
  expect(refineryAnalyzePayloadSchema.parse(ANALYZE_PAYLOAD)).toEqual(ANALYZE_PAYLOAD);
});

// ── Closed axes ─────────────────────────────────────────────────────────────────────────────────────────

test("the verdict axis is closed — a lowercase or foreign member is rejected", () => {
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, verdict: "accept" }).success).toBe(false);
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, verdict: "MAYBE" }).success).toBe(false);
});

test("the F4 mode axes are closed per stage (a rewrite mode is not a score mode)", () => {
  expect(refineryStageConfigSchema.parse(DEFAULT_REFINERY_STAGE_CONFIG)).toEqual(DEFAULT_REFINERY_STAGE_CONFIG);
  expect(refineryStageConfigSchema.safeParse({ ...DEFAULT_REFINERY_STAGE_CONFIG, score: { kind: "fixed", mode: "balanced" } }).success).toBe(false);
  expect(refineryStageConfigSchema.safeParse({ ...DEFAULT_REFINERY_STAGE_CONFIG, rewrite: { kind: "fixed", mode: "quick" } }).success).toBe(false);
});

// ── Bounds — the belt the per-wire scrubs cannot lose ───────────────────────────────────────────────────

test("scores hold the 1-10 rubric at the zod belt (0 and 11 rejected, fractional in-range accepted)", () => {
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, overallScore: SCORE_BELOW_MIN }).success).toBe(false);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, overallScore: SCORE_ABOVE_MAX }).success).toBe(false);
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulScore: SCORE_ABOVE_MAX }).success).toBe(false);
});

test("rewrite text caps at the card TEXT_MAX twin; an EMPTY STRING is still not a clear", () => {
  const at = { fields: [{ field: "description", text: "x".repeat(CARD_TEXT_MAX) }] };
  const over = { fields: [{ field: "description", text: "x".repeat(CARD_TEXT_MAX + 1) }] };
  const empty = { fields: [{ field: "description", text: "" }] };
  expect(refineryRewritePayloadSchema.safeParse(at).success).toBe(true);
  expect(refineryRewritePayloadSchema.safeParse(over).success).toBe(false);
  // `min(1)` SURVIVES the emptying ruling (schema-renderer §15.1): `""` stays illegal precisely so that
  // "the model emitted nothing" can never be mistaken for "the user's consolidation emptied this field".
  expect(refineryRewritePayloadSchema.safeParse(empty).success).toBe(false);
});

// ── The EMPTYING arm (owner overrule 2026-08-08 — "they can fill it therefore they can empty it";
//    design: docs/history/design/refinery-schema-renderer.md §15) ────────────────────────────────────────────────

test("a rewrite entry may CLEAR a field via the explicit tagged arm (never an empty string)", () => {
  const cleared = { fields: [{ field: "personality", cleared: true }] };
  expect(refineryRewritePayloadSchema.parse(cleared)).toEqual(cleared);
  // The greeting arm carries its index like any other entry — the slot it removes is addressed by position.
  const clearedGreeting = { fields: [{ field: "greetings", greetingIndex: 1, cleared: true }] };
  expect(refineryRewritePayloadSchema.parse(clearedGreeting)).toEqual(clearedGreeting);
  // Mixed rounds are the consolidation case: fill one field, empty its donors, in ONE payload.
  const consolidation = {
    fields: [
      { field: "description", text: "Everything, now in one place." },
      { field: "personality", cleared: true },
      { field: "scenario", cleared: true },
    ],
  };
  expect(refineryRewritePayloadSchema.parse(consolidation)).toEqual(consolidation);
});

test("the cleared arm is CLOSED: only literal true, and never beside text", () => {
  // `cleared: false` is not "don't clear" — it is a shape the contract does not speak.
  expect(refineryRewritePayloadSchema.safeParse({ fields: [{ field: "personality", cleared: false }] }).success).toBe(false);
  // An entry carrying NEITHER text nor cleared says nothing at all.
  expect(refineryRewritePayloadSchema.safeParse({ fields: [{ field: "personality" }] }).success).toBe(false);
  // Both arms at once: the TEXT arm wins (the non-destructive read) and `cleared` is stripped, which is
  // what makes it visible in the run row's `strippedKeys` itemization instead of vanishing into a success.
  const both = refineryRewritePayloadSchema.parse({ fields: [{ field: "personality", text: "dry", cleared: true }] });
  expect(both).toEqual({ fields: [{ field: "personality", text: "dry" }] });
});

// ── The APPEND arm (fork F-T1, owner-ruled IN for R4 — schema-renderer §7b's SPLIT case) ────────────────

test("a rewrite entry may APPEND a NEW greeting via the tagged arm, with no slot index", () => {
  const appended = { fields: [{ field: "greetings", append: true, text: "A brand-new opening." }] };
  expect(refineryRewritePayloadSchema.parse(appended)).toEqual(appended);
  // THE SPLIT: one greeting becomes two — the original slot is replaced and a new slot carries the rest.
  const split = {
    fields: [
      { field: "greetings", greetingIndex: 0, text: "The first half." },
      { field: "greetings", append: true, text: "The second half." },
    ],
  };
  expect(refineryRewritePayloadSchema.parse(split)).toEqual(split);
});

test("the append arm is GREETINGS-only, literal-true, and index-free", () => {
  // Every other refinable target already exists on the card — "add one" is meaningless, so the append arm
  // does not speak it. The entry falls through to the TEXT arm and `append` strips (visible in strippedKeys).
  const onDescription = refineryRewritePayloadSchema.parse({ fields: [{ field: "description", append: true, text: "x" }] });
  expect(onDescription).toEqual({ fields: [{ field: "description", text: "x" }] });
  // `append: false` is not a member of the append arm — the entry falls through to the TEXT arm and the
  // key strips, so it reads as an ordinary (slot-less) replacement rather than as a quiet append.
  expect(refineryRewritePayloadSchema.parse({ fields: [{ field: "greetings", append: false, text: "x" }] })).toEqual({
    fields: [{ field: "greetings", text: "x" }],
  });
  // …and with no text there is no arm left to fall through to.
  expect(refineryRewritePayloadSchema.safeParse({ fields: [{ field: "greetings", append: false }] }).success).toBe(false);
  // A slot index on an append is meaningless (the slot does not exist yet) and STRIPS — the arm order is
  // the non-destructive read: an ambiguous entry ADDS a greeting rather than overwriting one.
  const withIndex = refineryRewritePayloadSchema.parse({ fields: [{ field: "greetings", append: true, greetingIndex: 3, text: "x" }] });
  expect(withIndex).toEqual({ fields: [{ field: "greetings", append: true, text: "x" }] });
  // An append with no text says nothing at all.
  expect(refineryRewritePayloadSchema.safeParse({ fields: [{ field: "greetings", append: true }] }).success).toBe(false);
});

test("appendedRewrites is the ORDINAL address: payload order, appends only", () => {
  const payload = refineryRewritePayloadSchema.parse({
    fields: [
      { field: "greetings", append: true, text: "first new" },
      { field: "description", text: "replaced" },
      { field: "greetings", greetingIndex: 0, cleared: true },
      { field: "greetings", append: true, text: "second new" },
    ],
  });
  const appends = appendedRewrites(payload.fields);
  expect(appends).toHaveLength(2);
  // The ordinal an accept sends is the INDEX INTO THIS LIST — never the position in `fields`, which would
  // shift under any unrelated entry, and never a card slot, which does not exist yet.
  expect(appends[0]?.text).toBe("first new");
  expect(appends[1]?.text).toBe("second new");
  expect(appendedRewrites(refineryRewritePayloadSchema.parse({ fields: [{ field: "description", text: "x" }] }).fields)).toEqual([]);
});

test("isAppendedRewrite and isClearedRewrite recognise exactly their own arm", () => {
  const [append, replace, clear] = refineryRewritePayloadSchema.parse({
    fields: [
      { field: "greetings", append: true, text: "new" },
      { field: "greetings", greetingIndex: 0, text: "same slot" },
      { field: "greetings", greetingIndex: 1, cleared: true },
    ],
  }).fields;
  expect(append !== undefined && isAppendedRewrite(append)).toBe(true);
  expect(append !== undefined && isClearedRewrite(append)).toBe(false);
  expect(replace !== undefined && isAppendedRewrite(replace)).toBe(false);
  expect(clear !== undefined && isAppendedRewrite(clear)).toBe(false);
  expect(clear !== undefined && isClearedRewrite(clear)).toBe(true);
});

test("GREETING_SLOTS_MAX is the CARD's greetings ceiling (the append belt's cap twin)", () => {
  // The apply belt refuses an append at this count rather than building a patch `character.update` would
  // throw on — so the two sides must agree, and the card constant is unexported (pinned by behavior).
  expect(GREETING_SLOTS_MAX).toBe(CARD_GREETINGS_MAX);
  expect(GREETING_SLOTS_MAX).toBe(GREETING_INDEX_MAX + 1);
});

// The behavioral twin of the cap: the CARD side accepts exactly the same length, so an at-cap rewrite
// is always applicable via `character.update` (the constant itself is unexported — pinned by behavior).
test("the card contract accepts an at-cap description (the cap twin holds on both sides)", () => {
  const card = {
    name: "T",
    greetings: [],
    description: "x".repeat(CARD_TEXT_MAX),
    personality: null,
    scenario: null,
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
  expect(characterCardSchema.safeParse(card).success).toBe(true);
  expect(characterCardSchema.safeParse({ ...card, description: "x".repeat(CARD_TEXT_MAX + 1) }).success).toBe(false);
});

// ── Model-authored payload ceilings (security pass gap 1) ───────────────────────────────────────────────
// A card is UNTRUSTED text and a steered model authors these payloads; the analyze payload is STAMPED INTO
// CANON (`characters.refinery.analysis`) and ships on every card read, and every payload lands in an
// append-only run row. Unbounded strings/arrays were a store-and-serve amplification path with no belt.

// The densest legal critique: pure printable ASCII buys the full 4 chars per token, so an at-cap
// 4 000-token blob is 16 000 characters — FOUR TIMES what the superseded char cap allowed.
const ASCII_AT_TOKEN_CAP = "x".repeat(CRITIQUE_CHAR_BACKSTOP);
const ASCII_OVER_TOKEN_CAP = "x".repeat(CRITIQUE_CHAR_BACKSTOP + 4);
// The other end of the estimator: every non-ASCII codepoint costs a WHOLE token, so CJK hits the token cap
// at 1 char per token — the case the char backstop alone can never catch, and the reason a token belt exists.
const CJK_AT_TOKEN_CAP = "你".repeat(CRITIQUE_TOKEN_MAX);
const CJK_OVER_TOKEN_CAP = "你".repeat(CRITIQUE_TOKEN_MAX + 1);

// The refusal must speak the unit the product caps in — a char-flavoured message here would mean the cap
// regressed to the superseded ceiling even if the boundary happened to land in the same place.
const NAMES_TOKENS = /token/i;
const tokenIssue = (result: { success: boolean; error?: { issues: readonly { message: string }[] } }): boolean =>
  result.error?.issues.some((issue) => NAMES_TOKENS.test(issue.message)) ?? false;

test("the fixtures really sit where they claim (the estimator, not an assumption)", () => {
  expect(estimateTokens(ASCII_AT_TOKEN_CAP)).toBe(CRITIQUE_TOKEN_MAX);
  expect(estimateTokens(ASCII_OVER_TOKEN_CAP)).toBe(CRITIQUE_TOKEN_MAX + 1);
  expect(estimateTokens(CJK_AT_TOKEN_CAP)).toBe(CRITIQUE_TOKEN_MAX);
  expect(estimateTokens(CJK_OVER_TOKEN_CAP)).toBe(CRITIQUE_TOKEN_MAX + 1);
  // The derivation the char backstop IS: 4 chars is the most one token can ever buy under QuadChars, so a
  // token-legal string is always within 4 × the budget. A backstop below this would reject legal prose.
  expect(CJK_AT_TOKEN_CAP.length).toBeLessThanOrEqual(CRITIQUE_CHAR_BACKSTOP);
  expect(ASCII_AT_TOKEN_CAP.length).toBe(CRITIQUE_CHAR_BACKSTOP);
});

test("critique prose caps in TOKENS — an at-cap 4 000-token critique is accepted (summary + per-field)", () => {
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: ASCII_AT_TOKEN_CAP }).success).toBe(true);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: CJK_AT_TOKEN_CAP }).success).toBe(true);
  const atCapCritique = {
    ...SCORE_PAYLOAD,
    fieldScores: [{ field: "description", score: 7, strengths: ASCII_AT_TOKEN_CAP, weaknesses: CJK_AT_TOKEN_CAP, suggestions: "" }],
  };
  expect(refineryScorePayloadSchema.safeParse(atCapCritique).success).toBe(true);
});

test("one token over cap is refused, and the refusal NAMES TOKENS (the unit the product caps in)", () => {
  const overAscii = refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: ASCII_OVER_TOKEN_CAP });
  expect(overAscii.success).toBe(false);
  expect(tokenIssue(overAscii)).toBe(true);
  // The CJK arm is the one the char backstop is structurally blind to: 4 001 chars is far under 16 000, so
  // ONLY the token belt can refuse it.
  const overCjk = refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: CJK_OVER_TOKEN_CAP });
  expect(overCjk.success).toBe(false);
  expect(tokenIssue(overCjk)).toBe(true);
  expect(CJK_OVER_TOKEN_CAP.length).toBeLessThan(CRITIQUE_CHAR_BACKSTOP);
  const overCritique = {
    ...SCORE_PAYLOAD,
    fieldScores: [{ field: "description", score: 7, strengths: ASCII_OVER_TOKEN_CAP, weaknesses: "", suggestions: "" }],
  };
  expect(refineryScorePayloadSchema.safeParse(overCritique).success).toBe(false);
});

// FENCE, not a defect proof: an oversized blob was already refused by the superseded char cap. What this
// pins is the SHORT-CIRCUIT ARM of the token refinement. zod string checks are non-aborting, so the refine
// runs even on a blob `.max()` already refused — the guard answers on `.length` alone so the O(n) estimator
// never walks it (a naive `.refine(estimateTokens)` would make the byte ceiling a CPU amplifier: 40 MB
// measures ~1.9 s of pointless tokenizing). The arm cannot be timed deterministically, so what is asserted
// is its SEMANTICS: it must yield a REFUSAL that still names tokens. An inverted guard
// (`length > BACKSTOP || estimateTokens(...) <= MAX`) short-circuits to ACCEPT instead, and that is the
// realistic way this gets broken — it would go green on every other test in this file.
test("an over-backstop blob is refused BY THE TOKEN BELT (the short-circuit refuses, never accepts)", () => {
  const absurdBlob = "x".repeat(40_000_000);
  const result = refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: absurdBlob });
  expect(result.success).toBe(false);
  expect(tokenIssue(result)).toBe(true);
});

test("score payload list bounds hold (per-item length, item count, entry count)", () => {
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, priorityImprovements: ["x".repeat(NOTE_MAX)] }).success).toBe(true);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, priorityImprovements: ["x".repeat(NOTE_MAX + 1)] }).success).toBe(false);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, priorityImprovements: Array.from({ length: LIST_MAX + 1 }, () => "x") }).success).toBe(false);
  const entry = { field: "description", score: 7, strengths: "", weaknesses: "", suggestions: "" };
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, fieldScores: Array.from({ length: ENTRIES_MAX }, () => entry) }).success).toBe(true);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, fieldScores: Array.from({ length: ENTRIES_MAX + 1 }, () => entry) }).success).toBe(false);
});

test("analyze payload — the CANON-STAMPED payload — is bounded on every string and every list", () => {
  // `soulAssessment` is critique prose, so it carries the same TOKEN cap (and refuses in tokens).
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulAssessment: ASCII_AT_TOKEN_CAP }).success).toBe(true);
  const over = refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulAssessment: ASCII_OVER_TOKEN_CAP });
  expect(over.success).toBe(false);
  expect(tokenIssue(over)).toBe(true);
  // The six bullet lists are NOT critique prose — they stay short-label CHAR-capped, deliberately untouched.
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, preserved: ["x".repeat(NOTE_MAX)] }).success).toBe(true);
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, preserved: ["x".repeat(NOTE_MAX + 1)] }).success).toBe(false);
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, issues: Array.from({ length: LIST_MAX + 1 }, () => "x") }).success).toBe(false);
  // The whole point of the belt: a 2 MB summary from a steered model never reaches `characters.refinery`.
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulAssessment: "x".repeat(2_000_000) }).success).toBe(false);
});

test("rewrite payload caps its ENTRY COUNT, not just each text (the apply-blast-radius bound)", () => {
  const entry = { field: "description", text: "x" };
  expect(refineryRewritePayloadSchema.safeParse({ fields: Array.from({ length: ENTRIES_MAX }, () => entry) }).success).toBe(true);
  expect(refineryRewritePayloadSchema.safeParse({ fields: Array.from({ length: ENTRIES_MAX + 1 }, () => entry) }).success).toBe(false);
});

test("greetingIndex is bounded by the card's own greetings ceiling (payload entries + selection)", () => {
  const at = { fields: [{ field: "greetings", greetingIndex: GREETING_INDEX_MAX, text: "hi" }] };
  const over = { fields: [{ field: "greetings", greetingIndex: GREETING_INDEX_MAX + 1, text: "hi" }] };
  expect(refineryRewritePayloadSchema.safeParse(at).success).toBe(true);
  expect(refineryRewritePayloadSchema.safeParse(over).success).toBe(false);
  const score = {
    ...SCORE_PAYLOAD,
    fieldScores: [{ field: "greetings", greetingIndex: GREETING_INDEX_MAX + 1, score: 7, strengths: "", weaknesses: "", suggestions: "" }],
  };
  expect(refineryScorePayloadSchema.safeParse(score).success).toBe(false);
  expect(refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: [GREETING_INDEX_MAX + 1] }).success).toBe(false);
  // The DELTA shape reuses the same axis bounds — a second spelling would be a bound that drifts.
  expect(refinerySelectionPatchSchema.safeParse({ greetingIndexes: [GREETING_INDEX_MAX + 1] }).success).toBe(false);
});

// The three-state greeting axis of the `updateSession` delta. This is the fence on the two-writer seam:
// `applyFields` remaps `greetingIndexes` server-side, so "I did not address greetings" has to be SAYABLE
// (absent), distinct from "every greeting" (`null`) — the meaning the VALUE shape already spends absence
// on. Collapse the two and the remap dies under the next scope save.
test("the selection DELTA distinguishes absent (keep) from null (every greeting) from an array", () => {
  const absent = refinerySelectionPatchSchema.parse({ fields: ["greetings"] });
  expect("greetingIndexes" in absent && absent.greetingIndexes !== undefined).toBe(false);
  expect(refinerySelectionPatchSchema.parse({ greetingIndexes: null }).greetingIndexes).toBeNull();
  expect(refinerySelectionPatchSchema.parse({ greetingIndexes: [0, 2] }).greetingIndexes).toEqual([0, 2]);
  // Every member is optional — a delta may address ONE axis and say nothing about the other.
  expect(refinerySelectionPatchSchema.safeParse({}).success).toBe(true);
  // …and `null` is a greetings-only spelling: the VALUE shape still refuses it, so a delta cannot be
  // stored verbatim (the verb merges, then re-parses through the value schema).
  expect(refinerySelectionSchema.safeParse({ fields: [], greetingIndexes: null }).success).toBe(false);
});

// The behavioral twin of the greeting caps: an index of GREETING_INDEX_MAX is exactly the last slot the
// CARD can hold, so the payload can address every real greeting and no phantom one. Both constants are
// unexported on their own sides — this pin is what makes a future card-side change red here.
test("the greeting index ceiling is the card's greetings ceiling minus one", () => {
  const card = {
    name: "T",
    description: null,
    personality: null,
    scenario: null,
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
  expect(characterCardSchema.safeParse({ ...card, greetings: Array.from({ length: CARD_GREETINGS_MAX }, () => ({ text: "g" })) }).success).toBe(true);
  expect(characterCardSchema.safeParse({ ...card, greetings: Array.from({ length: CARD_GREETINGS_MAX + 1 }, () => ({ text: "g" })) }).success).toBe(false);
  expect(GREETING_INDEX_MAX).toBe(CARD_GREETINGS_MAX - 1);
  expect(ENTRIES_MAX).toBe(REFINABLE_FIELDS.length - 1 + CARD_GREETINGS_MAX);
});

// ── Host-authored free text that reaches a model (security pass gap 4) ──────────────────────────────────

test("session guidance caps at the model-facing prose ceiling", () => {
  expect(refineryGuidanceSchema.safeParse("keep her mean").success).toBe(true);
  expect(refineryGuidanceSchema.safeParse("x".repeat(GUIDANCE_MAX)).success).toBe(true);
  expect(refineryGuidanceSchema.safeParse("x".repeat(GUIDANCE_MAX + 1)).success).toBe(false);
});

test("session name is bounded (the roster row's label, host-authored)", () => {
  expect(refinerySessionNameSchema.safeParse("x".repeat(SESSION_NAME_MAX)).success).toBe(true);
  expect(refinerySessionNameSchema.safeParse("x".repeat(SESSION_NAME_MAX + 1)).success).toBe(false);
});

// ── Selection ───────────────────────────────────────────────────────────────────────────────────────────

test("selection enforces unique fields + unique non-negative greeting indexes", () => {
  expect(refinerySelectionSchema.safeParse({ fields: ["description", "greetings"], greetingIndexes: [0, 2] }).success).toBe(true);
  expect(refinerySelectionSchema.safeParse({ fields: ["description", "description"] }).success).toBe(false);
  expect(refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: [1, 1] }).success).toBe(false);
  expect(refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: [-1] }).success).toBe(false);
  // The selection is bounded too — it is stored AND it drives how much card text rides the stage prompt.
  expect(
    refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: Array.from({ length: CARD_GREETINGS_MAX + 1 }, (_, i) => i) }).success,
  ).toBe(false);
});

// ── The cross-namespace pin (the reason this test file exists in this shape) ────────────────────────────

test("REFINABLE_FIELDS names real canonical-card fields (the cycle-free ⊆-CharacterCard pin)", () => {
  // Compile-time: every member is a CharacterCard key. The refinery namespace cannot host this check —
  // its header forbids `#character` imports (the card imports the analyze payload FROM refinery).
  const fields: readonly (keyof CharacterCard)[] = REFINABLE_FIELDS;
  expect(new Set(fields).size).toBe(REFINABLE_FIELDS.length);
});

test("REFINERY_STAGE_PAYLOADS is the exhaustive per-stage dispatch (keys mirror the stage tuple)", () => {
  expectTypeOf<z.output<(typeof REFINERY_STAGE_PAYLOADS)["score"]>>().toEqualTypeOf<RefineryScorePayload>();
  expectTypeOf<z.output<(typeof REFINERY_STAGE_PAYLOADS)["rewrite"]>>().toEqualTypeOf<RefineryRewritePayload>();
  expectTypeOf<z.output<(typeof REFINERY_STAGE_PAYLOADS)["analyze"]>>().toEqualTypeOf<RefineryAnalyzePayload>();
  expect(Object.keys(REFINERY_STAGE_PAYLOADS).toSorted()).toEqual([...REFINERY_STAGES].toSorted());
});

// ── Views ───────────────────────────────────────────────────────────────────────────────────────────────

const RUN_META = {
  id: RUN_ID,
  sessionId: SESSION_ID,
  iteration: 0,
  model: "vetted-model",
  promptTokens: 512,
  outputTokens: 256,
  /** Wall time of the run that produced this row (schema-renderer §9.2 — the Runs ledger's `6.1s`). */
  durationMs: 6100,
  /** The DAG parent (schema-renderer §21 edge 1): the run this one CONSUMED. Null on a run that read none. */
  sourceRunId: null,
  // The strip-and-itemize record (R1 belt 6): dotted paths only, never content; [] = shape-clean.
  strippedKeys: [],
  createdAt: CREATED_AT,
};

test("a run view round-trips, and payload/config narrow BY stage (a score payload under analyze fails)", () => {
  // Fixtures stay UNANNOTATED (wire-shaped input) — the schema parse is the shape authority; the
  // branded id/model types exist only on the parse OUTPUT (typeIdSchema/brandedId mint them).
  const scoreRun = { ...RUN_META, stage: "score", payloadConfig: { kind: "fixed", mode: "full" }, payload: SCORE_PAYLOAD };
  expect(refineryRunSchema.parse(scoreRun)).toEqual(scoreRun);
  const analyzeRun = { ...RUN_META, stage: "analyze", payloadConfig: { kind: "fixed", mode: "iteration" }, payload: ANALYZE_PAYLOAD };
  expect(refineryRunSchema.parse(analyzeRun)).toEqual(analyzeRun);
  // The discrimination bites: the right stage with the WRONG payload shape is rejected.
  expect(refineryRunSchema.safeParse({ ...RUN_META, stage: "analyze", payloadConfig: { kind: "fixed", mode: "full" }, payload: SCORE_PAYLOAD }).success).toBe(
    false,
  );
  // A run id in the session position is rejected (typeIdSchema validates the prefix).
  expect(refineryRunSchema.safeParse({ ...scoreRun, sessionId: RUN_ID }).success).toBe(false);
});

test("the session summary round-trips; latestVerdict is null before the first analyze; character identity is REQUIRED on the row", () => {
  const summary = {
    id: SESSION_ID,
    characterId: CHARACTER_ID,
    characterName: "Seraphine",
    characterAvatarHash: null,
    name: null,
    status: "active",
    iterationCount: 0,
    latestVerdict: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
  expect(refinerySessionSummarySchema.parse(summary)).toEqual(summary);
  expect(refinerySessionSummarySchema.safeParse({ ...summary, status: "paused" }).success).toBe(false);
  // `characterName` is NON-nullable by construction: the roster read's ownership join is an INNER join on
  // `characters`, so a summary cannot exist without its card. A wire row without it is a bug, not a
  // "resolve it client-side" invitation — that mechanism had a 100-row page ceiling (schema header).
  const { characterName: _dropped, ...nameless } = summary;
  expect(refinerySessionSummarySchema.safeParse(nameless).success).toBe(false);
  expect(refinerySessionSummarySchema.safeParse({ ...summary, characterName: null }).success).toBe(false);
  // The avatar pointer IS nullable — an avatar-less card is a normal card.
  expect(refinerySessionSummarySchema.safeParse({ ...summary, characterAvatarHash: "abc123" }).success).toBe(true);
});
