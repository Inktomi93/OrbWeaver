// @orb/contracts/refinery — the card-refinery pipeline contracts (R0 of the owner-signed port:
// docs/design/refinery-r0.md; the study is docs/reviews/stickler/2026-08-08-card-refinery-port-study.md).
// SCORE → REWRITE → ANALYZE with an anti-drift invariant (analyze always compares against the session's
// original-card snapshot) and a REGRESSION-bearing verdict enum — the loop's contract, carried verbatim
// from the source extension.
//
// IMPORT DIRECTION (load-bearing): this namespace imports NOTHING from `#character`. The card contract
// imports `refineryAnalyzePayloadSchema` from HERE (for the card's derived `refinery` signals field), so
// a `#character` import in this file would be a module cycle. The `REFINABLE_FIELDS ⊆ CharacterCard`
// field-name pin therefore lives in the contract TEST (tests/contracts/refinery), which may import both.
//
// The stage PAYLOADS are the F3 "fixed typed payloads" — ONE schema per stage across every F4 mode
// (modes are PROMPT-tier variants; the extension's separate quick-score schema is deliberately
// collapsed). They are projected to provider wires via `projectJsonSchema` in R1, so they carry NO
// zod refinements — bounds are native keywords (grammar-enforced on vLLM, post-parse-belt everywhere
// else). Selection/config schemas are storage/input shapes, never projected, and MAY refine.

import type { ModelId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// The refinery prose slot table (R1) — composed into `PROSE_SLOTS` by `#prose` through this front door.
export { REFINERY_PROSE_SLOTS } from "./prose.ts";

// The extension's 1-10 rubric ("Rate this character card on a scale of 1-10"; the soul check is the
// same scale). Non-int: the overall score is a weighted average. Post-parse zod is the belt the
// per-wire scrubs cannot lose.
const SCORE_MIN = 1;
const SCORE_MAX = 10;
// The card TEXT_MAX twin (contracts/character) — an applied rewrite flows into `character.update`,
// whose text fields cap at 100 000; an uncapped payload would make the apply verb partial. Pinned
// behaviorally in the contract test (the character constant is unexported and unimportable from here).
const REWRITE_TEXT_MAX = 100_000;

// ── The MODEL-AUTHORED payload ceilings (security pass 2026-08-08 —
//    docs/reviews/security/2026-08-08-refinery-r0-security-pass.md gap 1) ──────────────────────────────
// A character card is UNTRUSTED text; a prompt-injected card can steer the model that AUTHORS these
// payloads. The analyze payload is stamped into CANON (`characters.refinery.analysis`), rides every card
// detail read AND every `character_snapshots` blob; the score/rewrite payloads land in append-only run
// rows. Unbounded strings/arrays therefore were a store-and-serve amplification path with no belt at all
// (measured: a 2 MB `summary` and a 5 000-entry array parsed clean). Every bound below is a NATIVE zod
// keyword — never a refinement — so it survives `projectJsonSchema` as `maxLength`/`maxItems` and is
// GRAMMAR-ENFORCED on the guided-decoding wire, while the hosted wires strip it and the zod belt re-imposes
// it on the reply (`kit/json-schema/wire-subset` states that contract).

/** One free-prose critique string (`summary`, `soulAssessment`, a per-field critique) — the
 *  `PROSE_MAX_CHARS` twin (contracts/prose-slot), this repo's ceiling for one model-facing prose blob. */
const PROSE_MAX = 4000;
/** One bullet in a list payload (`issues[]`, `preserved[]`, …) — a bullet, not an essay. */
const NOTE_MAX = 500;
/** Items in one bullet list. */
const LIST_MAX = 50;
/** Entries in a per-field payload array (`fieldScores`, rewrite `fields`) = one per ADDRESSABLE target:
 *  the 8 non-greeting refinable fields + the card's own 100-greeting ceiling. Pinned behaviorally against
 *  `REFINABLE_FIELDS.length` and `characterCardSchema` in the contract test (the card constant is
 *  unexported and unimportable from here — the REWRITE_TEXT_MAX precedent). */
const ENTRIES_MAX = 108;
/** The last greeting slot the CARD can hold (its `GREETINGS_MAX` minus one) — an index above it addresses
 *  a greeting that cannot exist, so a rewrite carrying one is unapplicable by construction. */
const GREETING_INDEX_MAX = 99;
/** Greeting slots one selection may name (the card's greetings ceiling). */
const GREETING_INDEXES_MAX = 100;
/** Host-authored session label (the card `NAME_MAX` twin — a roster row's label, not prose). */
const SESSION_NAME_MAX = 200;

// ── The pipeline axes (as-const tuples; unions derived — spine §7.5) ────────────────────────────────────

export const REFINERY_STAGES = ["score", "rewrite", "analyze"] as const;
export type RefineryStage = (typeof REFINERY_STAGES)[number];
export const refineryStageSchema = z.enum(REFINERY_STAGES);

/** The analyze verdict — carried VERBATIM from the source extension (its prompt corpus teaches these
 *  exact uppercase spellings, and REGRESSION is the iterate loop's stop condition). */
export const REFINERY_VERDICTS = ["ACCEPT", "NEEDS_REFINEMENT", "REGRESSION"] as const;
export type RefineryVerdict = (typeof REFINERY_VERDICTS)[number];
export const refineryVerdictSchema = z.enum(REFINERY_VERDICTS);

export const REFINERY_SESSION_STATUSES = ["active", "completed", "abandoned"] as const;
export type RefinerySessionStatus = (typeof REFINERY_SESSION_STATUSES)[number];
export const refinerySessionStatusSchema = z.enum(REFINERY_SESSION_STATUSES);

/** The coded reason for a stage run refused out of order (analyze with no rewrite to judge; a refinement
 *  round with no analyze to refine against). The client reads it off the BAD_REQUEST error body. */
export const REFINERY_STAGE_NOT_READY_REASON = "refinery_stage_not_ready";

// ── F4 stage modes (per-stage prompt-variant enums; the extension's 8 builtin presets ARE these) ────────

export const REFINERY_SCORE_MODES = ["full", "quick"] as const;
export type RefineryScoreMode = (typeof REFINERY_SCORE_MODES)[number];
export const refineryScoreModeSchema = z.enum(REFINERY_SCORE_MODES);

export const REFINERY_REWRITE_MODES = ["conservative", "balanced", "expansive"] as const;
export type RefineryRewriteMode = (typeof REFINERY_REWRITE_MODES)[number];
export const refineryRewriteModeSchema = z.enum(REFINERY_REWRITE_MODES);

export const REFINERY_ANALYZE_MODES = ["full", "iteration", "quick"] as const;
export type RefineryAnalyzeMode = (typeof REFINERY_ANALYZE_MODES)[number];
export const refineryAnalyzeModeSchema = z.enum(REFINERY_ANALYZE_MODES);

// ── F5 refinable fields (card text fields, canonical-card order; per-greeting via indexes) ──────────────

/** The card fields the pipeline may read/rewrite (F5: card fields only — attached books are a
 *  cross-domain follow-up, never v1). Members are CANONICAL CARD field names in card-schema order;
 *  `greetings` granularity rides `greetingIndexes` (selection) / `greetingIndex` (payload entries) —
 *  orb greetings are ONE index-addressable array. `depthPrompt` means the note TEXT (`.prompt`); the
 *  `{depth, role}` directive is authored config, not refinable prose. The ⊆-CharacterCard pin lives in
 *  the contract test (see the import-direction header note). */
export const REFINABLE_FIELDS = [
  "description",
  "personality",
  "scenario",
  "greetings",
  "exampleMessages",
  "systemPrompt",
  "postHistoryInstructions",
  "depthPrompt",
  "creatorNotes",
] as const;
export type RefinableField = (typeof REFINABLE_FIELDS)[number];
export const refinableFieldSchema = z.enum(REFINABLE_FIELDS);

/** Which card content rides the pipeline — session state (stored, never wire-projected).
 *  `greetingIndexes` applies when `fields` includes `greetings`: absent ⇒ every greeting. */
export const refinerySelectionSchema = z.object({
  fields: z.array(refinableFieldSchema).refine((fields) => new Set(fields).size === fields.length, "selection fields must be unique"),
  greetingIndexes: z
    .array(z.number().int().min(0).max(GREETING_INDEX_MAX))
    .max(GREETING_INDEXES_MAX)
    .refine((idxs) => new Set(idxs).size === idxs.length, "greeting indexes must be unique")
    .optional(),
});
export type RefinerySelection = z.infer<typeof refinerySelectionSchema>;

/** The session's loop-wide steering text ("keep her mean") — HOST-authored, but it is spliced into every
 *  stage prompt, so it crosses into the model wire and is bounded like any other model-facing prose. The
 *  ONE home for the `refinery_sessions.guidance` bound: R1's start/iterate inputs parse through THIS, and
 *  the prompt substrate neutralizes it before splicing (the `{{input}}` guided precedent). */
export const refineryGuidanceSchema = z.string().max(PROSE_MAX);

/** The session's optional roster label — host-authored, never model-facing. Bounded like the card's own
 *  `name`: it is a row label rendered in the D62 LIST pane, not a prose field. */
export const refinerySessionNameSchema = z.string().max(SESSION_NAME_MAX);

// ── Per-stage payload config — the kind-tagged SINGLE-ARM union (the SF extension seam) ─────────────────
// F3 v1 is fixed payloads, so today the one arm is `{kind:"fixed", mode}`. The sanctioned NL→schema
// extension arm (SF0) adds `{kind:"custom", schemaId}` as a UNION MEMBER — zero DDL, zero stored-row
// migration (sessions/runs store these as JSON). Locked kind-tagged from birth so that widening is
// additive (lock-the-extensible-shape).

export const refineryScoreConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryScoreModeSchema,
});
export type RefineryScoreConfig = z.infer<typeof refineryScoreConfigSchema>;

export const refineryRewriteConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryRewriteModeSchema,
});
export type RefineryRewriteConfig = z.infer<typeof refineryRewriteConfigSchema>;

export const refineryAnalyzeConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryAnalyzeModeSchema,
});
export type RefineryAnalyzeConfig = z.infer<typeof refineryAnalyzeConfigSchema>;

/** The session's in-force per-stage config (stored on `refinery_sessions.stage_config`). */
export const refineryStageConfigSchema = z.object({
  score: refineryScoreConfigSchema,
  rewrite: refineryRewriteConfigSchema,
  analyze: refineryAnalyzeConfigSchema,
});
export type RefineryStageConfig = z.infer<typeof refineryStageConfigSchema>;

/** A session's born configuration (score full · rewrite balanced · analyze full — the extension's
 *  "default" presets under the F4 mode names). */
export const DEFAULT_REFINERY_STAGE_CONFIG = {
  score: { kind: "fixed", mode: "full" },
  rewrite: { kind: "fixed", mode: "balanced" },
  analyze: { kind: "fixed", mode: "full" },
} as const satisfies RefineryStageConfig;

/** The per-RUN provenance snapshot (`refinery_runs.payload_config`) — the config arm that produced a
 *  run's payload. A TYPE union only: the arms' `kind` overlaps and modes collide across stages
 *  ("full"/"quick"), so a generic runtime union would mis-narrow — reads dispatch per stage through the
 *  run view / the per-stage schemas instead. */
export type RefineryStagePayloadConfig = RefineryScoreConfig | RefineryRewriteConfig | RefineryAnalyzeConfig;

// ── F3 stage payloads (fixed; wire-projected in R1 — NO refinements here, see the header) ───────────────

/** One field's critique in a score payload. `strengths`/`weaknesses`/`suggestions` are prose STRINGS
 *  (the extension's builtin score schema, not arrays). `greetingIndex` is present ⇔ `field` is
 *  `greetings` — a flat optional (not a per-entry union) for small-model structured-output reliability;
 *  the invariant's one enforcement consumer is R1's apply/render belt. */
export const refineryFieldScoreSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.number().int().min(0).max(GREETING_INDEX_MAX).optional(),
  score: z.number().min(SCORE_MIN).max(SCORE_MAX),
  strengths: z.string().max(PROSE_MAX),
  weaknesses: z.string().max(PROSE_MAX),
  suggestions: z.string().max(PROSE_MAX),
});
export type RefineryFieldScore = z.infer<typeof refineryFieldScoreSchema>;

export const refineryScorePayloadSchema = z.object({
  fieldScores: z.array(refineryFieldScoreSchema).max(ENTRIES_MAX),
  /** Weighted average over `fieldScores` — the value R1 stamps into `characters.refinery.score` (F6). */
  overallScore: z.number().min(SCORE_MIN).max(SCORE_MAX),
  priorityImprovements: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  summary: z.string().max(PROSE_MAX),
});
export type RefineryScorePayload = z.infer<typeof refineryScorePayloadSchema>;

/** One rewritten field. `text` caps at the card TEXT_MAX twin so an accepted rewrite always satisfies
 *  `character.update`; min(1) — a rewrite never CLEARS a field (clearing is authoring, not refining).
 *  `greetingIndex` ⇔ `field === "greetings"` (see refineryFieldScoreSchema). */
export const refineryRewriteFieldSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.number().int().min(0).max(GREETING_INDEX_MAX).optional(),
  text: z.string().min(1).max(REWRITE_TEXT_MAX),
});
export type RefineryRewriteField = z.infer<typeof refineryRewriteFieldSchema>;

/** The structured rewrite — the single biggest correctness upgrade over the extension (which
 *  regex-parsed markdown back into fields): typed entries make compare + apply lossless by construction.
 *  `fields` is entry-COUNT-capped as well as per-text-capped: the entry count is the apply verb's blast
 *  radius (one entry = one card field overwritten), and one payload can never name more targets than the
 *  card has. */
export const refineryRewritePayloadSchema = z.object({
  fields: z.array(refineryRewriteFieldSchema).max(ENTRIES_MAX),
});
export type RefineryRewritePayload = z.infer<typeof refineryRewritePayloadSchema>;

/** The anti-drift comparison verdict — ALWAYS rewrite-vs-ORIGINAL (the session's `original_card`
 *  snapshot), never rewrite-vs-previous-rewrite. The soul check is the 1-10 "does it still feel like
 *  the same character" rubric.
 *
 *  THE ONE PAYLOAD THAT REACHES CANON: R1 stamps it into `characters.refinery.analysis` (F6), so these
 *  bytes ride every card detail read AND every `character_snapshots` blob taken afterwards. Its ceilings
 *  are the tightest in this file for that reason. */
export const refineryAnalyzePayloadSchema = z.object({
  preserved: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  lost: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  gained: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  soulScore: z.number().min(SCORE_MIN).max(SCORE_MAX),
  soulAssessment: z.string().max(PROSE_MAX),
  verdict: refineryVerdictSchema,
  issues: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  recommendations: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
});
export type RefineryAnalyzePayload = z.infer<typeof refineryAnalyzePayloadSchema>;

export type RefineryStagePayload = RefineryScorePayload | RefineryRewritePayload | RefineryAnalyzePayload;

/** The exhaustive per-stage payload-schema dispatch (spine §7.5 mapped-Record) — the ONE home R1's run
 *  writes/reads and the client's payload rendering resolve a stage's schema through. A new stage member
 *  fails tsc here before anything else. */
export const REFINERY_STAGE_PAYLOADS = {
  score: refineryScorePayloadSchema,
  rewrite: refineryRewritePayloadSchema,
  analyze: refineryAnalyzePayloadSchema,
} as const satisfies Record<RefineryStage, z.ZodType>;

// ── Wire views (tRPC outputs; the FULL session view with `originalCard` homes in domain/refinery's
//    contract/ (R1) — it needs `#character`, which this file must not import) ───────────────────────────

const refineryRunBaseSchema = z.object({
  id: typeIdSchema(ID_PREFIX.refineryRun),
  sessionId: typeIdSchema(ID_PREFIX.refinerySession),
  /** Which refinement round produced this run (0 = the initial pass; `iterate` increments). */
  iteration: z.number().int().min(0),
  model: brandedId<ModelId>(),
  /** Provider-reported usage, or null when the backend reports none (stats parity). */
  promptTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
  /** The keys the zod strip-mode parse silently REMOVED from the model's payload — dotted paths, never
   *  content (the strip-and-itemize posture: an invented key must appear in the run record instead of
   *  vanishing into a success; security pass §1 gap 5 / belt 6). Empty = the payload was shape-clean. */
  strippedKeys: z.array(z.string()),
  createdAt: z.number().int(),
});

/** One append-only pipeline run, discriminated on `stage` so the payload AND the provenance config
 *  narrow together ("current result per stage" = latest run per (session, stage)). */
export const refineryRunSchema = z.discriminatedUnion("stage", [
  refineryRunBaseSchema.extend({
    stage: z.literal("score"),
    payloadConfig: refineryScoreConfigSchema,
    payload: refineryScorePayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("rewrite"),
    payloadConfig: refineryRewriteConfigSchema,
    payload: refineryRewritePayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("analyze"),
    payloadConfig: refineryAnalyzeConfigSchema,
    payload: refineryAnalyzePayloadSchema,
  }),
]);
export type RefineryRun = z.infer<typeof refineryRunSchema>;

/** The sessions-roster row (D62: name · character · verdict badge · updatedAt). `latestVerdict` is the
 *  newest analyze run's verdict, null before the first analyze. Character display resolves client-side
 *  by `characterId`; the full session view (R1, domain contract/) carries `originalCard`. */
export const refinerySessionSummarySchema = z.object({
  id: typeIdSchema(ID_PREFIX.refinerySession),
  characterId: typeIdSchema(ID_PREFIX.character),
  name: refinerySessionNameSchema.nullable(),
  status: refinerySessionStatusSchema,
  iterationCount: z.number().int().min(0),
  latestVerdict: refineryVerdictSchema.nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type RefinerySessionSummary = z.infer<typeof refinerySessionSummarySchema>;
