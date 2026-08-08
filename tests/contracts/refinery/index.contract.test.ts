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
  refineryRewritePayloadSchema,
  refineryRunSchema,
  refineryScorePayloadSchema,
  refinerySelectionSchema,
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

// ── Selection ───────────────────────────────────────────────────────────────────────────────────────────

test("selection enforces unique fields + unique non-negative greeting indexes", () => {
  expect(refinerySelectionSchema.safeParse({ fields: ["description", "greetings"], greetingIndexes: [0, 2] }).success).toBe(true);
  expect(refinerySelectionSchema.safeParse({ fields: ["description", "description"] }).success).toBe(false);
  expect(refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: [1, 1] }).success).toBe(false);
  expect(refinerySelectionSchema.safeParse({ fields: ["greetings"], greetingIndexes: [-1] }).success).toBe(false);
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
