// Contract pins for @orb/contracts/refinery (R0 — docs/design/refinery-r0.md): the F3 fixed stage
// payloads round-trip parse-is-identity; the F4 mode / verdict / status axes are closed; the score
// bounds + the rewrite-text card-cap twin hold at the zod belt (the layer the per-wire scrubs cannot
// lose); the run view discriminates payload BY stage; and REFINABLE_FIELDS ⊆ CharacterCard — the pin
// that CANNOT live in the refinery namespace itself (its header forbids `#character` imports to keep
// the character→refinery edge one-way), so it lives here, where both namespaces are importable.

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardSchema } from "@orb/contracts/character";
import type { RefineryAnalyzePayload, RefineryRewritePayload, RefineryScorePayload } from "@orb/contracts/refinery";
import {
  DEFAULT_REFINERY_STAGE_CONFIG,
  REFINABLE_FIELDS,
  REFINERY_STAGE_PAYLOADS,
  REFINERY_STAGES,
  refineryAnalyzePayloadSchema,
  refineryGuidanceSchema,
  refineryRewritePayloadSchema,
  refineryRunSchema,
  refineryScorePayloadSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionSummarySchema,
  refineryStageConfigSchema,
} from "@orb/contracts/refinery";
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
const PROSE_MAX = 4000;
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

test("rewrite text caps at the card TEXT_MAX twin and never clears a field", () => {
  const at = { fields: [{ field: "description", text: "x".repeat(CARD_TEXT_MAX) }] };
  const over = { fields: [{ field: "description", text: "x".repeat(CARD_TEXT_MAX + 1) }] };
  const empty = { fields: [{ field: "description", text: "" }] };
  expect(refineryRewritePayloadSchema.safeParse(at).success).toBe(true);
  expect(refineryRewritePayloadSchema.safeParse(over).success).toBe(false);
  expect(refineryRewritePayloadSchema.safeParse(empty).success).toBe(false);
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

test("score payload prose caps at the model-facing prose ceiling (summary + per-field critique)", () => {
  const atCap = { ...SCORE_PAYLOAD, summary: "x".repeat(PROSE_MAX) };
  expect(refineryScorePayloadSchema.safeParse(atCap).success).toBe(true);
  expect(refineryScorePayloadSchema.safeParse({ ...SCORE_PAYLOAD, summary: "x".repeat(PROSE_MAX + 1) }).success).toBe(false);
  const overCritique = {
    ...SCORE_PAYLOAD,
    fieldScores: [{ field: "description", score: 7, strengths: "x".repeat(PROSE_MAX + 1), weaknesses: "", suggestions: "" }],
  };
  expect(refineryScorePayloadSchema.safeParse(overCritique).success).toBe(false);
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
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulAssessment: "x".repeat(PROSE_MAX) }).success).toBe(true);
  expect(refineryAnalyzePayloadSchema.safeParse({ ...ANALYZE_PAYLOAD, soulAssessment: "x".repeat(PROSE_MAX + 1) }).success).toBe(false);
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

test("the session summary round-trips; latestVerdict is null before the first analyze", () => {
  const summary = {
    id: SESSION_ID,
    characterId: CHARACTER_ID,
    name: null,
    status: "active",
    iterationCount: 0,
    latestVerdict: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
  expect(refinerySessionSummarySchema.parse(summary)).toEqual(summary);
  expect(refinerySessionSummarySchema.safeParse({ ...summary, status: "paused" }).success).toBe(false);
});
