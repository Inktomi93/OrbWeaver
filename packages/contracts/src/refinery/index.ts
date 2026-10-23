// @orb/contracts/refinery — the card-refinery pipeline contracts (R0 of the owner-signed port;
// D171).
// SCORE → REWRITE → ANALYZE with an anti-drift invariant (analyze always compares against the session's
// original-card snapshot) and a REGRESSION-bearing verdict enum — the loop's contract, carried verbatim
// from the source extension.
//
// Character consumes analysis from ./core.ts, not this root, so browser outputs can compose its validators
// without an initialization cycle. Core never imports either public root.
//
// The stage PAYLOADS are the F3 "fixed typed payloads" — ONE schema per stage across every F4 mode
// (modes are PROMPT-tier variants; the extension's separate quick-score schema is deliberately
// collapsed). They are projected to provider wires via `projectJsonSchema` in R1, so EVERY bound is
// expressed as a NATIVE zod keyword (grammar-enforced on vLLM, post-parse-belt everywhere else).
// Selection/config schemas are storage/input shapes, never projected, and MAY refine.
//
// THE ONE SANCTIONED REFINEMENT (owner ruling 2026-08-08, amending the pre-2026-08-08 "carry NO zod
// refinements" rule): critique prose is capped in TOKENS, and a token count is not a JSON-Schema keyword —
// no grammar can express it, so the belt is the ONLY possible enforcer for that tier. The relaxation is
// SAFE because it is additive: every critique field still carries its native `.max()`, so the projected
// wire schema is unchanged in KIND and the grammar still prevents at the char tier; the refinement only
// tightens the parse. Verified, not assumed (zod 4.4.3): `z.toJSONSchema` does NOT throw on a refined
// string — it silently DROPS the refinement and keeps `maxLength`, so the projection stays whole. The
// cost is stated plainly: an over-token blob is now a FAILED RUN rather than an ungeneratable one.

import type { CharacterId, CharacterSnapshotId, ModelId, RefinerySessionId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { liftJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import type { CharacterCard, CharacterDetail } from "#character";
import { characterCardViewSchema, characterDetailSchema } from "#character";
import type { RefineryAnalyzePayload } from "./core.ts";
import {
  critiqueProseSchema,
  LIST_MAX,
  NOTE_MAX,
  refineryAnalyzePayloadSchema,
  refineryAnalyzePayloadViewSchema,
  refineryVerdictSchema,
  SCORE_MAX,
  SCORE_MIN,
} from "./core.ts";

export {
  type RefineryAnalyzePayload,
  type RefineryVerdict,
  refineryVerdictSchema,
  SCORE_MAX,
} from "./core.ts";
// The refinery prose slot table (R1) — composed into `PROSE_SLOTS` by `#prose` through this front door.
export { REFINERY_PROSE_SLOTS } from "./prose.ts";
// The raw-door PREFLIGHT (advisories + stats). Sits BESIDE the belt, never in front of it: the belt
// refuses, this only explains what a schema that saves will still cost on a hosted wire. It imports
// nothing from this package, so its position in the re-export order carries no load-order meaning.
export * from "./schema-advisory.ts";
export * from "./schema-authoring.ts";
// The forge's WIRE GRAMMAR (task #36 — the meta-schema every NL→schema call is constrained by). Imports
// ./schema-authoring.ts for the caps it mirrors, so it is re-exported AFTER it.
export * from "./schema-forge.ts";
// What the bound Utility model would do with a draft: the structured planner's answer, server-computed.
export * from "./schema-plan.ts";

// The 1-10 rubric bounds + the verdict vocabulary live in ./core.ts (schema-authoring's well-known-core
// check needs them and this file re-exports ./schema-authoring — importing them back out of here would
// close a cycle).
// The card TEXT_MAX twin (contracts/character) — an applied rewrite flows into `character.update`,
// whose text fields cap at 100 000; an uncapped payload would make the apply verb partial. Pinned
// in the contract test against the character contract's exported `TEXT_MAX`.
const REWRITE_TEXT_MAX = 100_000;

/** Host-authored free prose that reaches a model wire (session `guidance`) — the `PROSE_MAX_CHARS` twin
 *  (contracts/prose-slot), and deliberately still CHARS. It is a typed input field, not model-authored
 *  critique output: a human types it into a bounded control, so the char cap is the one the editor can show
 *  and the token ruling above does not reach it. */
const HOST_PROSE_MAX_CHARS = 4000;
/** Entries in a per-field payload array (`fieldScores`, rewrite `fields`) = one per ADDRESSABLE target:
 *  the 8 non-greeting refinable fields + the card's own 100-greeting ceiling. Pinned in the contract test
 *  against `REFINABLE_FIELDS.length` and the character contract's exported `GREETINGS_MAX`. */
const ENTRIES_MAX = 108;
/** The card's greetings CEILING (`characterCardSchema`'s own `GREETINGS_MAX`) — the twin the append belt
 *  caps against: a rewrite may grow a card's greetings, never past what the card contract accepts, so the
 *  apply verb refuses the entry rather than letting `character.update` throw on a payload we constructed.
 *  Pinned in the contract test against the character contract's exported `GREETINGS_MAX`. */
export const GREETING_SLOTS_MAX = 100;
/** The last greeting slot the CARD can hold — an index above it addresses a greeting that cannot exist,
 *  so a rewrite carrying one is unapplicable by construction. DERIVED, so the pair can never drift. */
const GREETING_INDEX_MAX = GREETING_SLOTS_MAX - 1;
/** Greeting slots one selection may name (every slot the card can hold). */
const GREETING_INDEXES_MAX = GREETING_SLOTS_MAX;
/** Host-authored session label (the card `NAME_MAX` twin — a roster row's label, not prose). */
const SESSION_NAME_MAX = 200;

// ── WORST-CASE PAYLOAD BUDGET (recomputed 2026-08-08 for the chars→tokens cap; measured, not estimated) ──
// Every string and array at its ceiling, serialized:
//   • ANALYZE — THE ONE THAT REACHES CANON — ~127 KB → ~139 KB (+9%). The 4× prose growth barely moves it:
//     six 50×500 note lists dominate this payload, and one critique string is a small share of it. This is
//     the number that matters, because these bytes ride every card detail read and every snapshot blob.
//   • SCORE (append-only run rows, never canon) — ~1.27 MB → ~4.99 MB (~3.9×). The growth lands almost
//     entirely here: 108 entries × 3 critique strings is 324 of the 325 prose blobs in the whole contract.
//   • REWRITE — unchanged; it is capped by the CARD's own text ceiling (`REWRITE_TEXT_MAX`), not by prose.
// PARSE COST of the refinement, worst case (325 at-cap strings, ~5 MB): ~22 ms warm / ~28 ms cold. It stays
// linear because the char backstop bounds ONE string at 16 000 chars — a single multi-megabyte string, where
// the codepoint walk degrades badly (5.2 MB in one string measured ~251 ms), is refused in O(1) instead.
// The SCORE ceiling is theoretical: 325 at-cap blobs is ~1.3 M output tokens, which no single generation
// call can emit — a realistic 20-entry at-cap payload is ~0.96 MB and ~4 ms.

// ── The pipeline axes (as-const tuples; unions derived — spine §7.5) ────────────────────────────────────

export const REFINERY_STAGES = ["score", "rewrite", "analyze"] as const;
export type RefineryStage = (typeof REFINERY_STAGES)[number];
export const refineryStageSchema = z.enum(REFINERY_STAGES) satisfies z.ZodType<RefineryStage>;

// (REFINERY_VERDICTS / refineryVerdictSchema re-homed to ./core.ts — see the note above.)

export const REFINERY_SESSION_STATUSES = ["active", "completed", "abandoned"] as const;
export type RefinerySessionStatus = (typeof REFINERY_SESSION_STATUSES)[number];
export const refinerySessionStatusSchema = z.enum(REFINERY_SESSION_STATUSES) satisfies z.ZodType<RefinerySessionStatus>;

/** The coded reason for a stage run refused out of order (analyze with no rewrite to judge; a refinement
 *  round with no analyze to refine against). The client reads it off the BAD_REQUEST error body. */
export const REFINERY_STAGE_NOT_READY_REASON = "refinery_stage_not_ready";

/** The coded reason for a stage run refused because the CALLER'S OWN preset caps `maxOutputTokens` below
 *  what this stage's payload needs (the ruled refusal, live-e2e 2026-08-09 open fork 1). Distinct from
 *  {@link REFINERY_STAGE_NOT_READY_REASON} because the fix is a different knob — raise the preset cap or
 *  narrow the selection, not "run the missing stage first" — and the server's sentence carries the fit
 *  receipt (the computed need, the cap, the knob), so the client quotes it rather than inventing copy. */
export const REFINERY_OUTPUT_BUDGET_REASON = "refinery_output_budget_too_small";

/** The coded reason for a refinement round refused because ANOTHER round already holds the session's
 *  in-flight claim (#1568). Distinct from the two above because it is neither an ordering mistake nor a knob:
 *  nothing is wrong, the session is simply busy, and the fix is to wait for the round in flight. Refused
 *  BEFORE any model call, so a loser pays nothing. */
export const REFINERY_ROUND_IN_FLIGHT_REASON = "refinery_round_in_flight";

/** The coded reason for an Apply refused on a session that is already completed: its rewrite was applied
 *  to the live card, and running a stage re-opens it. */
export const REFINERY_SESSION_COMPLETED_REASON = "refinery_session_completed";

// ── F4 stage modes (per-stage prompt-variant enums; the extension's 8 builtin presets ARE these) ────────

export const REFINERY_SCORE_MODES = ["full", "quick"] as const;
export type RefineryScoreMode = (typeof REFINERY_SCORE_MODES)[number];
const refineryScoreModeSchema = z.enum(REFINERY_SCORE_MODES) satisfies z.ZodType<RefineryScoreMode>;

const REFINERY_REWRITE_MODES = ["conservative", "balanced", "expansive"] as const;
export type RefineryRewriteMode = (typeof REFINERY_REWRITE_MODES)[number];
const refineryRewriteModeSchema = z.enum(REFINERY_REWRITE_MODES) satisfies z.ZodType<RefineryRewriteMode>;

const REFINERY_ANALYZE_MODES = ["full", "iteration", "quick"] as const;
export type RefineryAnalyzeMode = (typeof REFINERY_ANALYZE_MODES)[number];
const refineryAnalyzeModeSchema = z.enum(REFINERY_ANALYZE_MODES) satisfies z.ZodType<RefineryAnalyzeMode>;

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
export const refinableFieldSchema = z.enum(REFINABLE_FIELDS) satisfies z.ZodType<RefinableField>;

// The two selection AXES, spelled once and reused by both the VALUE shape and the PATCH shape below —
// the bounds are the same question in either direction, and a second spelling is a bound that drifts.
const selectionFieldsSchema = z.array(refinableFieldSchema).refine((fields) => new Set(fields).size === fields.length, "selection fields must be unique");
const selectionGreetingIndexesSchema = z
  .array(z.int().min(0).max(GREETING_INDEX_MAX))
  .max(GREETING_INDEXES_MAX)
  .refine((idxs) => new Set(idxs).size === idxs.length, "greeting indexes must be unique");

/** Which card content rides the pipeline — session state (stored, never wire-projected).
 *  `greetingIndexes` applies when `fields` includes `greetings`: absent ⇒ every greeting. */
export const refinerySelectionSchema = z.object({
  fields: selectionFieldsSchema,
  greetingIndexes: selectionGreetingIndexesSchema.optional(),
});
export type RefinerySelection = z.infer<typeof refinerySelectionSchema>;

/**
 * The `updateSession` SELECTION DELTA — a DISTINCT shape from the value above, and the distinction is
 * load-bearing law. `selection` has TWO writers: the user's scope dialog and `applyFields`, which REMAPS
 * `greetingIndexes` server-side when an accepted rewrite removes a greeting (the session speaks in
 * positions). A whole-record replace from a client image built before that remap silently undoes it —
 * the `mergeSheet` (rpg `patchSheet`) key-presence precedent, one JSON column over.
 *
 * THE THREE STATES OF `greetingIndexes` HERE — do NOT flatten them:
 *   • ABSENT  ⇒ KEEP whatever is stored (the writer is not addressing greetings; the remap survives).
 *   • `null`  ⇒ EVERY greeting — the patch-level spelling of the value shape's ABSENT.
 *   • array   ⇒ exactly these positions.
 *
 * The `null` arm exists precisely so this delta can say "every greeting" WITHOUT reusing absence, which
 * the value shape already spent on that meaning (and which the scope dialog's all-checked LAW depends
 * on). Collapsing the two would make "I didn't touch greetings" unsayable and re-open the two-writer
 * clobber. The verb re-parses the MERGED WHOLE through {@link refinerySelectionSchema}: this schema
 * validates the delta, that one stays the stored-shape belt.
 */
export const refinerySelectionPatchSchema = z.object({
  fields: selectionFieldsSchema.optional(),
  greetingIndexes: selectionGreetingIndexesSchema.nullable().optional(),
});
export type RefinerySelectionPatch = z.infer<typeof refinerySelectionPatchSchema>;

/** The session's loop-wide steering text ("keep her mean") — HOST-authored, but it is spliced into every
 *  stage prompt, so it crosses into the model wire and is bounded like any other model-facing prose. The
 *  ONE home for the `refinery_sessions.guidance` bound: R1's start/iterate inputs parse through THIS, and
 *  the prompt substrate neutralizes it before splicing (the `{{input}}` guided precedent). */
export const refineryGuidanceSchema = z.string().max(HOST_PROSE_MAX_CHARS);

/** The session's optional roster label — host-authored, never model-facing. Bounded like the card's own
 *  `name`: it is a row label rendered in the D62 LIST pane, not a prose field. */
export const refinerySessionNameSchema = z.string().max(SESSION_NAME_MAX);

// ── Per-stage payload config — the kind-tagged union (the SF seam, now TWO-ARMED on score/analyze) ──────
// The SESSION-side custom arm is a POINTER (`{kind:"custom", schemaId}`): the session's in-force schema
// is mutable state, re-resolved at every run so a schema edit governs the next call (the D126 per-call
// discipline). The RUN-side provenance arm EMBEDS the schema (further down — the P1-B header ruling);
// the two arms are deliberately different shapes for different lifetimes. REWRITE has no custom arm
// (F-N3: the apply path's semantics ARE the fixed typed contract) — its second RUN-side arm is `manual`
// (a hand-authored rewrite, og-extension-feedback gap 1).

/** The fixed arm, score. Exported apart from the session union: run rows and the read-seam heal speak
 *  the ARM, not the union (a strip-mode union parse would silently eat a custom embed's schema). */
export const refineryScoreFixedConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryScoreModeSchema,
});
type RefineryScoreFixedConfig = z.infer<typeof refineryScoreFixedConfigSchema>;

export const refineryRewriteConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryRewriteModeSchema,
});
type RefineryRewriteConfig = z.infer<typeof refineryRewriteConfigSchema>;

export const refineryAnalyzeFixedConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryAnalyzeModeSchema,
});
type RefineryAnalyzeFixedConfig = z.infer<typeof refineryAnalyzeFixedConfigSchema>;

/** The SESSION-side custom arm — a pointer at an owned `refinery_schemas` row. `brandedId`, not
 *  `typeIdSchema`: the id is an INPUT the verb immediately resolves against the owned table (the lookup
 *  is the real belt), and stored config blobs re-parse through this at the read seam — a length-strict
 *  parse would heal a whole session config over an id-shape nit. */
export const refineryCustomStageConfigSchema = z.object({
  kind: z.literal("custom"),
  schemaId: typeIdSchema(ID_PREFIX.refinerySchema),
});

/** Session score config: fixed mode, or a custom schema pointer. */
const refineryScoreConfigSchema = z.union([refineryScoreFixedConfigSchema, refineryCustomStageConfigSchema]);

/** Session analyze config: fixed mode, or a custom schema pointer. */
const refineryAnalyzeConfigSchema = z.union([refineryAnalyzeFixedConfigSchema, refineryCustomStageConfigSchema]);

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

/** The RUN-side custom provenance arm — SELF-CONTAINED per the P1-B ruling: the run log is append-only forever, so a run EMBEDS
 *  the schema it was produced under (depth-capped objects are small; runs are per-user artifacts, dedupe
 *  is not worth a join) plus the schema row's `version` at run time. The renderer and the read-seam
 *  re-parse never dereference a live `refinery_schemas` row for a historical run — "the schema is gone"
 *  is unrepresentable rather than a state the run viewer has to survive. The session-side POINTER arm
 *  above is the mutable half; the resolve-and-embed happens inside `runStage`. */
export const refineryCustomRunConfigSchema = z.object({
  kind: z.literal("custom"),
  schemaId: typeIdSchema(ID_PREFIX.refinerySchema),
  schemaVersion: z.int().min(1),
  schema: z.record(z.string(), z.unknown()),
});
export type RefineryCustomRunConfig = z.infer<typeof refineryCustomRunConfigSchema>;

/** The RUN-side manual-rewrite provenance arm — a HAND-authored rewrite (og-extension-feedback gap 1,
 *  the ShadowKyogre fork: score → hand-edit → analyze). No mode, no model, no schema: the payload is the
 *  same typed rewrite contract, authored by the owner in the WIP edit area instead of a model. */
export const refineryManualRewriteConfigSchema = z.object({
  kind: z.literal("manual"),
});
type RefineryManualRewriteConfig = z.infer<typeof refineryManualRewriteConfigSchema>;

/** The per-RUN provenance union (`refinery_runs.payload_config`) — the config arm that produced a run's
 *  payload. A TYPE union only: the arms' `kind` overlaps and modes collide across stages ("full"/"quick"),
 *  so a generic runtime union would mis-narrow — reads dispatch per stage through the run view / the
 *  per-ARM schemas instead. */
export type RefineryStagePayloadConfig =
  | RefineryScoreFixedConfig
  | RefineryRewriteConfig
  | RefineryAnalyzeFixedConfig
  | RefineryCustomRunConfig
  | RefineryManualRewriteConfig;

// ── F3 stage payloads (fixed; wire-projected in R1 — NO refinements here, see the header) ───────────────

/** One field's critique in a score payload. `strengths`/`weaknesses`/`suggestions` are prose STRINGS
 *  (the extension's builtin score schema, not arrays). `greetingIndex` is present ⇔ `field` is
 *  `greetings` — a flat optional (not a per-entry union) for small-model structured-output reliability;
 *  the invariant's one enforcement consumer is R1's apply/render belt. */
const refineryFieldScoreSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.int().min(0).max(GREETING_INDEX_MAX).optional(),
  score: z.number().min(SCORE_MIN).max(SCORE_MAX),
  strengths: critiqueProseSchema,
  weaknesses: critiqueProseSchema,
  suggestions: critiqueProseSchema,
});
export const refineryScorePayloadSchema = z.object({
  fieldScores: z.array(refineryFieldScoreSchema).max(ENTRIES_MAX),
  /** Weighted average over `fieldScores` — the value R1 stamps into `characters.refinery.score` (F6). */
  overallScore: z.number().min(SCORE_MIN).max(SCORE_MAX),
  priorityImprovements: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  summary: critiqueProseSchema,
});
export type RefineryScorePayload = z.infer<typeof refineryScorePayloadSchema>;

/** The addressing half every rewrite entry carries, whichever arm it takes. `greetingIndex` ⇔
 *  `field === "greetings"` (see refineryFieldScoreSchema). */
const rewriteFieldTarget = {
  field: refinableFieldSchema,
  greetingIndex: z.int().min(0).max(GREETING_INDEX_MAX).optional(),
};

/** One rewritten field — a THREE-ARM union: replace the text, EMPTY the field, or APPEND a new greeting.
 *
 *  EMPTYING IS REFINING (owner ruling 2026-08-08, overruling the R0 stance that lived on this comment —
 *  "why wouldn't they be able to empty personality? They can fill it therefore they can empty it").
 *  Consolidating several fields into one REQUIRES clearing the donors, so the pipeline must be able to say
 *  it.
 *
 *  WHY A TAGGED ARM AND NOT `text: ""` (all three reasons are load-bearing):
 *   • GRAMMAR HONESTY. `text` keeps `min(1)`, so the projected `minLength` is unchanged on every wire and
 *     `""` never becomes a semantics-bearing token — "the model emitted nothing" stays distinguishable
 *     from "the user's consolidation emptied this field".
 *   • MODEL LEGIBILITY. A small model handles `{"field":"scenario","cleared":true}` far better than an
 *     empty string that means something, and the guided-decoding grammar enforces the arm exactly.
 *   • ANTI-SNIFFING. `""`-as-clear is one more data-sniffed convention — the failure class the whole
 *     schema-driven design exists to kill.
 *
 *  APPENDING IS REFINING TOO (fork F-T1, owner-ruled IN for R4): "split one greeting
 *  into two" is squarely the owner's SPLIT case, and before this arm a payload could only ever address slots
 *  the card already had (an entry naming `greetingIndex === liveGreetingCount` died at `greeting_index_invalid`).
 *  The arm is GREETINGS-ONLY: every other refinable target is a single field that already exists on the card,
 *  so "add one" is meaningless there — only the greetings array has slots to grow.
 *
 *  WHY THE APPEND ARM CARRIES NO INDEX: a new slot has no card position yet. An `index === liveGreetingCount`
 *  convention would be exactly the data-sniffed addressing this contract exists to refuse (and it is not even
 *  well-defined for two appends in one payload, or against a card that moved under the session). Appends are
 *  addressed POSITIONALLY instead — by their ordinal among THIS payload's append entries, which is stable
 *  forever because a run row is immutable. The accept side names that same ordinal (`appendIndex`).
 *
 *  `text` caps at the card TEXT_MAX twin so an accepted rewrite always satisfies `character.update`.
 *  ARM ORDER IS THE NON-DESTRUCTIVE READ: a malformed entry carrying several tags parses as the LEAST
 *  destructive arm it matches and the surplus keys strip — landing in the run row's `strippedKeys`
 *  itemization rather than silently destroying a field (belt 6). Hence append FIRST (adding a slot destroys
 *  nothing), then replace, then clear. Spelled as a plain union, not a discriminated one: the tag is
 *  optional on one arm, which `z.discriminatedUnion` cannot express. */
export const refineryRewriteFieldSchema = z.union([
  z.object({ field: z.literal("greetings"), append: z.literal(true), text: z.string().min(1).max(REWRITE_TEXT_MAX) }),
  z.object({ ...rewriteFieldTarget, text: z.string().min(1).max(REWRITE_TEXT_MAX) }),
  z.object({ ...rewriteFieldTarget, cleared: z.literal(true) }),
]);
export type RefineryRewriteField = z.infer<typeof refineryRewriteFieldSchema>;

/** Is this entry the EMPTYING arm? The ONE recogniser — the apply verb's patch builder, the prompt
 *  overlay and the R3 block renderer all ask through here rather than re-spelling `"cleared" in entry`
 *  (a dynamic seam the language service cannot rename). */
export function isClearedRewrite(entry: RefineryRewriteField): entry is Extract<RefineryRewriteField, { cleared: true }> {
  return "cleared" in entry;
}

/** Is this entry the APPEND arm (a NEW greeting slot)? The {@link isClearedRewrite} twin — the same one
 *  recogniser law, for the same reason: `"append" in entry` spelled at six call sites is a dynamic seam. */
export function isAppendedRewrite(entry: RefineryRewriteField): entry is Extract<RefineryRewriteField, { append: true }> {
  return "append" in entry;
}

/** The APPEND entries of a payload, in payload order — the ONE derivation of the ordinal every accept, every
 *  itemized result and every review block addresses an appended greeting by. Homed here (not in the verb or
 *  the client) because BOTH sides must compute it identically: the client picks `appendIndex` off this order
 *  and the apply verb resolves it off the same order over the same immutable run row. */
export function appendedRewrites(fields: readonly RefineryRewriteField[]): Extract<RefineryRewriteField, { append: true }>[] {
  return fields.filter((entry) => isAppendedRewrite(entry));
}

/** The structured rewrite — the single biggest correctness upgrade over the extension (which
 *  regex-parsed markdown back into fields): typed entries make compare + apply lossless by construction.
 *  `fields` is entry-COUNT-capped as well as per-text-capped: the entry count is the apply verb's blast
 *  radius (one entry = one card field overwritten), and one payload can never name more targets than the
 *  card has. */
const refineryRewritePayloadSchema = z.object({
  fields: z.array(refineryRewriteFieldSchema).max(ENTRIES_MAX),
});
export type RefineryRewritePayload = z.infer<typeof refineryRewritePayloadSchema>;

/** Drop a `greetingIndex` from an entry whose field is not `greetings` — the address biconditional the flat
 *  optional cannot express in the projected grammar. */
function withoutStrayGreetingIndex(entry: RefineryRewriteField): RefineryRewriteField {
  if (entry.field === "greetings" || isAppendedRewrite(entry) || entry.greetingIndex === undefined) {
    return entry;
  }
  const { greetingIndex: _stray, ...addressed } = entry;
  return addressed;
}

/** The PARSE-SIDE rewrite payload: every producer's payload (model reply, hand-authored rewrite) parses
 *  through this, never the bare wire schema. A model routinely puts a `greetingIndex` on a non-greetings
 *  field; left in place it reaches the review as a malformed address the apply verb refuses, so it is
 *  stripped here and the parse seam's key diff itemizes it in the run's `strippedKeys`. Kept apart from
 *  {@link refineryRewritePayloadSchema} because that one is projected to provider wires, where a transform
 *  has no JSON-Schema spelling. */
export const refineryRewriteParseSchema = refineryRewritePayloadSchema.transform(
  (payload): RefineryRewritePayload => ({ fields: payload.fields.map(withoutStrayGreetingIndex) }),
) satisfies z.ZodType<RefineryRewritePayload>;

/** One review block's Keep/Discard decision: `true` keeps, `false` discards, `null` is undecided. */
const refineryRewriteDecisionSchema = z.boolean().nullable();
export type RefineryRewriteDecision = z.infer<typeof refineryRewriteDecisionSchema>;

/** The session's persisted decision sheets, keyed BY REWRITE RUN: a re-run reopens every block undecided,
 *  because a verdict pressed against old text is not a judgement about the new text. Index = the entry's
 *  position in that run's payload `fields` (immutable, unlike the selection-filtered review list). Keys are
 *  run ids the `decideRewrite` verb verified belong to the session. */
/** One rewrite run's sheet — one decision per payload entry, so never longer than a payload can be. */
export const refineryRewriteSheetSchema = z.array(refineryRewriteDecisionSchema).max(ENTRIES_MAX) satisfies z.ZodType<RefineryRewriteDecision[]>;
export const refineryRewriteDecisionsSchema = z.record(z.string(), refineryRewriteSheetSchema);
export type RefineryRewriteDecisions = z.infer<typeof refineryRewriteDecisionsSchema>;

export type RefineryStagePayload = RefineryScorePayload | RefineryRewritePayload | RefineryAnalyzePayload;

interface RefineryStagePayloadByStage {
  readonly score: RefineryScorePayload;
  readonly rewrite: RefineryRewritePayload;
  readonly analyze: RefineryAnalyzePayload;
}

type RefineryStagePayloadSchemas = {
  readonly [Stage in RefineryStage]: z.ZodType<RefineryStagePayloadByStage[Stage]>;
};

/** The exhaustive per-stage FIXED payload-schema dispatch (spine §7.5 mapped-Record). Since the custom
 *  arm landed this is no longer the whole dispatch home — {@link payloadSchemaFor} is: fixed/manual runs
 *  resolve here, custom runs lift their EMBEDDED schema. A new stage member fails tsc here first. */
export const REFINERY_STAGE_PAYLOADS = {
  score: refineryScorePayloadSchema,
  rewrite: refineryRewritePayloadSchema,
  analyze: refineryAnalyzePayloadSchema,
} as const satisfies RefineryStagePayloadSchemas;

/** The payload schema selected by the two runtime discriminants. Fixed/manual runs select the stage's
 * authored schema; a custom run lifts its embedded object schema and therefore has only the truthful
 * static `ZodObject` contract. */
type RefineryPayloadSchemaFor<TStage extends RefineryStage, TConfig extends RefineryStagePayloadConfig> = TConfig extends RefineryCustomRunConfig
  ? z.ZodObject
  : (typeof REFINERY_STAGE_PAYLOADS)[TStage];

/** THE payload-schema dispatch (the honest one-home once the custom arm exists):
 *  a fixed or manual run parses the stage's typed contract; a custom run parses the schema EMBEDDED in
 *  its own provenance (never a live row — P1-B). Throws `JsonSchemaLiftError` only on a corrupt embed,
 *  which the read seam treats as the payload-no-longer-parses heal. */
export function payloadSchemaFor<TStage extends RefineryStage, TConfig extends RefineryStagePayloadConfig>(
  stage: TStage,
  payloadConfig: TConfig,
): RefineryPayloadSchemaFor<TStage, TConfig>;
export function payloadSchemaFor<TStage extends RefineryStage>(
  stage: TStage,
  payloadConfig: RefineryStagePayloadConfig,
): z.ZodObject | (typeof REFINERY_STAGE_PAYLOADS)[TStage] {
  return payloadConfig.kind === "custom" ? liftJsonSchema(payloadConfig.schema) : REFINERY_STAGE_PAYLOADS[stage];
}

// ── The stage-SYSTEM shape restatement ────────────────────────────────────────────
// A weak-model courtesy that pairs with the real constraint (the structured-output `responseFormat`): the
// system prompt names the JSON shape the payload above expects. It is SPLICED into the prose slots through
// the `{{shape}}` pre-substitution token rather than written into them, so a host's prose override can
// never freeze one payload's shape into owner-editable text — and so the SF custom arm has exactly ONE
// seam to fill (`REFINERY_STAGE_SHAPES` becomes the fixed-arm default; a custom run splices its own
// projected shape). It lives HERE, beside the schemas it restates, not in `./prose.ts`: prose.ts is
// imported BY this file, so the reverse import would close a cycle.

/** The `{{shape}}` token's NAME as `spliceProseTokens` keys it (the braces are the text's, not the key's). */
export const REFINERY_SHAPE_TOKEN = "shape";

/** What `{{shape}}` resolves to per stage under the FIXED payloads. The refinement-rewrite system slot
 *  shares the `rewrite` entry — it produces the same payload. */
export const REFINERY_STAGE_SHAPES = {
  score:
    '{"fieldScores":[{"field":"...","score":7,"strengths":"...","weaknesses":"...","suggestions":"..."}],"overallScore":7,"priorityImprovements":["..."],"summary":"..."}',
  rewrite: '{"fields":[{"field":"...","text":"..."}]}',
  analyze:
    '{"preserved":["..."],"lost":["..."],"gained":["..."],"soulScore":9,"soulAssessment":"...","verdict":"ACCEPT","issues":["..."],"recommendations":["..."]}',
} as const satisfies Record<RefineryStage, string>;

// ── The library SCORE SWEEP (R4 — port study I3: the orb-native win the extension never had) ────────────
// A `refine-score-sweep` workload scores the whole library with NO session: one score pass per card,
// stamped straight into `characters.refinery.score` (the F6 signal channel), feeding the library's
// score sorts and the dossier readout. Params + result home HERE, beside the payload the pass produces —
// `@orb/contracts/workloads` references them by kind (the `IngestRunResult` precedent), never re-spells them.

/** `refine-score-sweep` params. `rescoreAll` is the FILL-vs-REFRESH switch: absent (the default) the sweep
 *  scores only cards with no score yet — the "fill the library" pass a user runs after importing, which must
 *  not spend one model call per already-scored card. `true` re-scores everything (the card texts moved, or
 *  the model did). Deliberately the only tunable: mode/selection are the SWEEP's own posture, not a knob —
 *  a per-card session is where a user chooses those. */
export const refineScoreSweepWorkloadParams = z.object({ rescoreAll: z.boolean().optional() });
export type RefineScoreSweepWorkloadParams = z.infer<typeof refineScoreSweepWorkloadParams>;

/** What one sweep pass did. FOUR counts, not the two `AnalyticsResult` carries: a sweep that skipped 400
 *  already-scored cards and failed 3 must be able to SAY so — distill's own header records the cost of
 *  squeezing a per-item failure plane into `{scanned, written}` (its `skipped` count survives only as a
 *  progress sentence). Every card lands in exactly one of `scored`/`skipped`/`failed`. */
export interface RefineryScoreSweepResult {
  /** Cards the pass looked at (the owner's non-synthetic library, or every owner's on a bulk run). */
  readonly scanned: number;
  /** Cards whose score reached `characters.refinery.score`. */
  readonly scored: number;
  /** Cards the pass declined to score: no card text to critique, or already scored without `rescoreAll`. */
  readonly skipped: number;
  /** Cards whose score pass produced nothing usable (per-card containment — one bad card never aborts the sweep). */
  readonly failed: number;
}

// Wire views compose character validators; the analysis dependency stays in the lower core leaf.

const refineryRunBaseSchema = z.object({
  id: typeIdSchema(ID_PREFIX.refineryRun),
  sessionId: typeIdSchema(ID_PREFIX.refinerySession),
  /** Which refinement round produced this run (0 = the initial pass; `iterate` increments). */
  iteration: z.int().min(0),
  /** Null on exactly the `manual` provenance arm — a hand-authored rewrite has no model, and an honest
   *  null beats a sentinel spelling (the anti-sniffing law). */
  model: brandedId("ModelId").nullable(),
  /** Provider-reported usage, or null when the backend reports none (stats parity). */
  promptTokens: z.int().min(0).nullable(),
  outputTokens: z.int().min(0).nullable(),
  /** The run's WALL TIME in ms — the Runs ledger's third economic column beside the two token counts
   *  (`qwen3-32b · 4 210 in / 512 out · 6.1s`). Measured by the injected clock across the whole stage
   *  pass, so it includes prompt assembly and the bounded structured retry, which is what a user
   *  comparing two runs actually waited. Never null: a run that produced a row took some time. */
  durationMs: z.int().min(0),
  /** The DAG PARENT: the run whose output this one CONSUMED — an analyze names the rewrite it judged, a
   *  rewrite names the score (or, on a refinement round, the analyze) it worked from. Null on a run that
   *  read no prior run.
   *
   *  WHY IT IS A COLUMN AND NOT AN INFERENCE: the
   *  append-only log is a timestamp-ordered list, so "which rewrite did this analyze judge?" is answerable
   *  only by "the latest one at the time" — which stops being true the moment step-back lets an analyze
   *  target round 1 while round 2 exists. Recorded, the ledger draws the true DAG instead of implying a
   *  straight line. Session-scoped by construction (both rows hang off the same session). [OVERRULED:
   *  D24 — this IS a self-FK, shipped as `refinery_runs.source_run_id`, references onDelete set null,
   *  in packages/db/src/schema/refinery.ts: boundaries are physics, so the original "no FK needed beyond
   *  session scope" design was rejected; set null (not cascade) because a parent's disappearance means
   *  the DAG edge is UNKNOWN, not that the child should vanish.] */
  sourceRunId: typeIdSchema(ID_PREFIX.refineryRun).nullable(),
  /** The keys the zod strip-mode parse silently REMOVED from the model's payload — dotted paths, never
   *  content (the strip-and-itemize posture: an invented key must appear in the run record instead of
   *  vanishing into a success; security pass §1 gap 5 / belt 6). Empty = the payload was shape-clean. */
  strippedKeys: z.array(z.string()),
  createdAt: z.int(),
});

/** A custom run's payload on the wire: shape-valid against its EMBEDDED schema at write AND at the read
 *  seam — the wire type is the honest "an object of the run's own schema" (the client renders it through
 *  the render plan derived from that same embed, never through the fixed contracts). */
const customPayloadSchema = z.record(z.string(), z.unknown());

/** One append-only pipeline run. A plain union (not `z.discriminatedUnion`): score/analyze each carry TWO
 *  arms per stage literal (fixed + custom), which a single-key discriminator cannot spell. Narrow by
 *  `stage`, then by `payloadConfig.kind` — the provenance and the payload type move together. */
const refineryRunSchema = z.union([
  refineryRunBaseSchema.extend({
    stage: z.literal("score"),
    payloadConfig: refineryScoreFixedConfigSchema,
    payload: refineryScorePayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("score"),
    payloadConfig: refineryCustomRunConfigSchema,
    payload: customPayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("rewrite"),
    payloadConfig: z.union([refineryRewriteConfigSchema, refineryManualRewriteConfigSchema]),
    payload: refineryRewritePayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("analyze"),
    payloadConfig: refineryAnalyzeFixedConfigSchema,
    payload: refineryAnalyzePayloadSchema,
  }),
  refineryRunBaseSchema.extend({
    stage: z.literal("analyze"),
    payloadConfig: refineryCustomRunConfigSchema,
    payload: customPayloadSchema,
  }),
]);
export type RefineryRun = z.infer<typeof refineryRunSchema>;

/** The sessions-roster row (D62: name · character · verdict badge · updatedAt). `latestVerdict` is the
 *  newest analyze run's verdict, null before the first analyze; {@link RefinerySessionView} carries
 *  `originalCard`.
 *
 *  CHARACTER IDENTITY RIDES THE ROW, SERVER-SIDE. This comment previously read "Character display
 *  resolves client-side by `characterId`" — TRUTH-REPAIRED (orchestrator ruling, 2026-08-09), because
 *  that mechanism has a hard ceiling the roster cannot survive: the client join's only source is
 *  `character.list`, a cursor page capped at 100 rows (`MAX_LIMIT`, domain/character/verbs/list.ts), so
 *  a session whose card sits past page one renders UNNAMED and is unfindable by the roster's own search
 *  (the paginating-a-list-breaks-resolve-by-find class). The persistence read ALREADY inner-joins
 *  `characters` for owner-scoping (domain/refinery/persistence/queries.ts), so carrying the two display
 *  facts costs one left-join to `assets` and no extra query — and `characterName` is non-nullable
 *  precisely BECAUSE that join is an inner one: a summary exists only where its character does. */
export const refinerySessionSummarySchema = z.object({
  id: typeIdSchema(ID_PREFIX.refinerySession),
  characterId: typeIdSchema(ID_PREFIX.character),
  /** The card's display name, joined server-side — the roster row's TITLE and its search key. */
  characterName: z.string(),
  /** The CAS hash of the card's `avatarAssetId` (`assets.hash`, joined server-side); `blobUrl(hash)` is
   *  the row avatar's `src`. Null when the card has no avatar. */
  characterAvatarHash: z.string().nullable(),
  name: refinerySessionNameSchema.nullable(),
  status: refinerySessionStatusSchema,
  iterationCount: z.int().min(0),
  latestVerdict: refineryVerdictSchema.nullable(),
  createdAt: z.int(),
  updatedAt: z.int(),
});
export type RefinerySessionSummary = z.infer<typeof refinerySessionSummarySchema>;

/** One `iterate` round: the refinement rewrite + the analyze that judged it, plus the bumped counter. */
export interface IterateResult {
  readonly rewrite: RefineryRun;
  readonly analyze: RefineryRun;
  readonly iterationCount: number;
}

/** One stage's preflight readout (schema-renderer §8) — the RESOLVED posture (floor + the owner's preset
 *  params, re-run per call) plus both fit estimates. Estimates are QuadChars-honest ADVISORIES: the copy
 *  says "likely", never a hard number (`@orb/kit/tokens`' own doctrine). */
export interface StagePreflight {
  readonly stage: RefineryStage;
  readonly model: ModelId;
  readonly temperature: number | null;
  readonly maxOutputTokens: number | null;
  /** Estimated PROMPT tokens for this stage as currently configured (the real assembled prompt, measured). */
  readonly inputEstimate: number;
  /** Estimated OUTPUT tokens this stage's reply wants (§8's per-stage arithmetic). */
  readonly outputEstimate: number;
}

export interface PreflightResult {
  /** The summarize role's context window, when the backend declares one. */
  readonly contextTokens: number | null;
  readonly stages: readonly StagePreflight[];
}

/** `generateSchema`/`refineSchema` — ERRORS-AS-DATA (the applyRefusal precedent): a draft that failed the
 *  belt on BOTH turns still RESOLVES, carrying the refusal + the model's raw last reply so the editor can
 *  offer it for hand-fixing (the extension's own show-the-partial policy, NL design §1.1.5/§2.1 — the raw
 *  never rides an error message). Provider faults still throw. */
export type SchemaForgeResult =
  /** `dropped` itemizes design rows the transpiler could not place (a duplicate path, a path that collides
   *  with a value). Never silence — a dropped row is data the editor shows (D112 (3)). */
  | { readonly kind: "draft"; readonly name: string; readonly schema: Record<string, unknown>; readonly dropped: readonly string[] }
  /** The HONEST-REFUSAL arm (task #36, owner: "think about the people who want to do weird scorings"): the
   *  ask needs a construct the generator's guaranteed-servable leaf language cannot express (a union, a
   *  heterogeneous array, deeper nesting). The RAW JSON-Schema door takes the full liftable vocabulary, so
   *  the editor routes there with `skeleton` — whatever the design DID reach — as the starting point. A
   *  lossy flat approximation of the author's idea would be the wrong answer. */
  | { readonly kind: "needs-raw"; readonly message: string; readonly skeleton: Record<string, unknown> }
  | { readonly kind: "failed"; readonly message: string; readonly raw: string | null };
const refineryScorePayloadViewSchema = refineryScorePayloadSchema.strict().extend({
  fieldScores: z.array(refineryFieldScoreSchema.strict()).max(ENTRIES_MAX),
}) satisfies z.ZodType<RefineryScorePayload>;
const refineryRewriteFieldViewSchema = z.union(refineryRewriteFieldSchema.options.map((option) => option.strict()));
const refineryRewritePayloadViewSchema = refineryRewritePayloadSchema.strict().extend({
  fields: z.array(refineryRewriteFieldViewSchema).max(ENTRIES_MAX),
}) satisfies z.ZodType<RefineryRewritePayload>;
const refineryStageConfigViewSchema = refineryStageConfigSchema.strict().extend({
  score: z.union(refineryScoreConfigSchema.options.map((option) => option.strict())),
  rewrite: refineryRewriteConfigSchema.strict(),
  analyze: z.union(refineryAnalyzeConfigSchema.options.map((option) => option.strict())),
}) satisfies z.ZodType<RefineryStageConfig>;
const refineryCustomRunConfigViewSchema = refineryCustomRunConfigSchema.strict();
const [scoreFixedRun, scoreCustomRun, rewriteRun, analyzeFixedRun, analyzeCustomRun] = refineryRunSchema.options;
export const refineryRunViewSchema = z.union([
  scoreFixedRun.strict().extend({ payloadConfig: refineryScoreFixedConfigSchema.strict(), payload: refineryScorePayloadViewSchema }),
  scoreCustomRun.strict().extend({ payloadConfig: refineryCustomRunConfigViewSchema }),
  rewriteRun.strict().extend({
    payloadConfig: z.union([refineryRewriteConfigSchema.strict(), refineryManualRewriteConfigSchema.strict()]),
    payload: refineryRewritePayloadViewSchema,
  }),
  analyzeFixedRun.strict().extend({ payloadConfig: refineryAnalyzeFixedConfigSchema.strict(), payload: refineryAnalyzePayloadViewSchema }),
  analyzeCustomRun.strict().extend({ payloadConfig: refineryCustomRunConfigViewSchema }),
]) satisfies z.ZodType<RefineryRun>;
export const iterateResultSchema = z.strictObject({
  rewrite: refineryRunViewSchema,
  analyze: refineryRunViewSchema,
  iterationCount: z.number(),
}) satisfies z.ZodType<IterateResult>;
const stagePreflightSchema = z.strictObject({
  stage: refineryStageSchema,
  model: brandedId("ModelId"),
  temperature: z.number().nullable(),
  maxOutputTokens: z.number().nullable(),
  inputEstimate: z.number(),
  outputEstimate: z.number(),
}) satisfies z.ZodType<StagePreflight>;
export const preflightResultSchema = z.strictObject({
  contextTokens: z.number().nullable(),
  stages: z.array(stagePreflightSchema).readonly(),
}) satisfies z.ZodType<PreflightResult>;
/** Dynamic model-authored object, already belted against the author's selected schema by the service. */
export const refineryTestResultSchema = z.record(z.string(), z.unknown());
export type RefineryTestResult = z.infer<typeof refineryTestResultSchema>;
export const schemaForgeResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("draft"), name: z.string(), schema: refineryTestResultSchema, dropped: z.array(z.string()).readonly() }),
  z.strictObject({ kind: z.literal("needs-raw"), message: z.string(), skeleton: refineryTestResultSchema }),
  z.strictObject({ kind: z.literal("failed"), message: z.string(), raw: z.string().nullable() }),
]) satisfies z.ZodType<SchemaForgeResult>;

export const refineryScoreSweepResultSchema = z.strictObject({
  scanned: z.number(),
  scored: z.number(),
  skipped: z.number(),
  failed: z.number(),
}) satisfies z.ZodType<RefineryScoreSweepResult>;

/** The full session (the CONTENT surface's state) — summary fields + the anti-drift anchor + config. */
export interface RefinerySessionView {
  readonly id: RefinerySessionId;
  readonly characterId: CharacterId;
  readonly name: string | null;
  readonly status: RefinerySessionStatus;
  /** The session-start card snapshot — the anchor every analyze compares against (never edited). */
  readonly originalCard: CharacterCard;
  readonly selection: RefinerySelection;
  readonly stageConfig: RefineryStageConfig;
  /** The review's Keep/Discard sheets, keyed by rewrite run id — what the workbench reopens with. */
  readonly rewriteDecisions: RefineryRewriteDecisions;
  readonly guidance: string | null;
  readonly iterationCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Why one accepted entry was REFUSED — itemized per entry so the user learns which field and why. Owner
 *  ruling: the apply is atomic, so any refusal refuses the whole act, and the user recovers by discarding the
 *  refused entries. A closed axis so the client renders typed copy. The
 *  tuple stays UNEXPORTED until a runtime consumer exists (R3's reason-copy map re-exports it then);
 *  the derived union below is the wire surface. */
const APPLY_DROP_REASONS = [
  /** The accept names a field the latest rewrite run did not produce. */
  "not_in_rewrite",
  /** The accept names a field outside the SESSION's selection — the model (or the caller) does not get to
   *  widen its own apply scope (belt 9: the systemPrompt-injection stopper). */
  "not_selected",
  /** `field === "greetings"` but the entry carries no `greetingIndex`. */
  "greeting_index_missing",
  /** The `greetingIndex` names a slot past the LIVE card's greetings — a greeting deleted since session
   *  start is dropped, never re-created by index. */
  "greeting_index_invalid",
  /** `greetingIndex` present on a non-greetings field. */
  "greeting_index_forbidden",
  /** The LIVE card no longer carries the structure this entry needs (a depth-prompt rewrite with the
   *  note since deleted — the rewrite cannot invent the `{depth, role}` directive, which is authored). */
  "not_applicable",
  /** A greeting CLEAR that would leave the card with zero greetings. Emptying a field is refining; leaving
   *  a character with no first message is a worse authoring state than any empty field, so the last
   *  surviving slot refuses rather than being written away (schema-renderer §15.2). */
  "would_leave_no_greeting",
  /** An APPEND that would push the card past the greetings ceiling (`GREETING_SLOTS_MAX`). Itemized rather
   *  than thrown, and rather than letting the constructed patch fail `updateCharacterSchema`: a card at its
   *  ceiling is a legal card, so a payload wanting one more slot is a refusal about THIS entry (F-T1). */
  "greeting_cap_reached",
  /** The MERGE CONFLICT (schema-renderer §21 edge 2): the LIVE card's text for this field differs from
   *  the session's `original_card` pin — someone edited it under the session — and the accept carried no
   *  `confirmDiverged`. Never written blind: the surface re-opens the block as a BASE·LIVE·REWRITE
   *  conflict and the re-confirmed accept passes. */
  "diverged_since_session",
] as const;

export type ApplyDropReason = (typeof APPLY_DROP_REASONS)[number];

/** What an applied entry DID. The emptying arm makes this load-bearing: destruction must be itemized
 *  separately from replacement so the outcome panel and the audit trail state it explicitly rather than
 *  leaving a user to infer it from a diff with a blank side (schema-renderer §15.5). `added` is the F-T1
 *  append arm's twin — a NEW greeting slot is not a replacement of anything, and reporting it as one would
 *  make the outcome panel lie about which slot moved. Same posture as the drop reasons: the tuple stays
 *  unexported until a runtime consumer exists. */
const APPLIED_FIELD_KINDS = ["replaced", "cleared", "added"] as const;

export type AppliedFieldKind = (typeof APPLIED_FIELD_KINDS)[number];

/** Where an itemized entry POINTED. The two indexes are mutually exclusive and neither is a spelling of the
 *  other: `greetingIndex` names a slot the card HAS, `appendIndex` names the k-th NEW greeting a rewrite
 *  payload asked for (`appendedRewrites`' ordinal — the only stable address a slot-less entry can carry). */
interface RefineryFieldRef {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
  readonly appendIndex?: number | undefined;
}

export interface AppliedFieldRef extends RefineryFieldRef {
  readonly kind: AppliedFieldKind;
}

export interface DroppedField extends RefineryFieldRef {
  readonly reason: ApplyDropReason;
}

export interface ApplyFieldsResult {
  readonly applied: readonly AppliedFieldRef[];
  readonly dropped: readonly DroppedField[];
  /** The updated character detail (the injected `character.update`'s own return) — the client's refresh. */
  readonly character: CharacterDetail;
  /** The pre-apply snapshot's id (schema-renderer §16.2's result widening) — the immediate "view the
   *  rollback point" affordance. Null on exactly the zero-write arm, where NO snapshot was taken (the
   *  surface states that plainly rather than leaving a missing rollback point unexplained). */
  readonly snapshotId: CharacterSnapshotId | null;
}

/** `applyAsCopy` — the branch-off result: the same itemization, the FRESH character (never the live one),
 *  and no snapshot by construction (nothing existing was written — the outcome copy says so). Null
 *  `character` on the zero-write arm: every accept died on the belts, so no copy was minted. */
export interface ApplyAsCopyResult {
  readonly applied: readonly AppliedFieldRef[];
  readonly dropped: readonly DroppedField[];
  readonly character: CharacterDetail | null;
}

export const refinerySessionViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.refinerySession),
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string().nullable(),
  status: refinerySessionStatusSchema,
  originalCard: characterCardViewSchema,
  selection: refinerySelectionSchema.strict(),
  stageConfig: refineryStageConfigViewSchema,
  rewriteDecisions: refineryRewriteDecisionsSchema,
  guidance: z.string().nullable(),
  iterationCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<RefinerySessionView>;

const refineryFieldRefShape = {
  field: refinableFieldSchema,
  greetingIndex: z.number().optional(),
  appendIndex: z.number().optional(),
};

const appliedFieldRefSchema = z.strictObject({ ...refineryFieldRefShape, kind: z.enum(APPLIED_FIELD_KINDS) }) satisfies z.ZodType<AppliedFieldRef>;

const droppedFieldSchema = z.strictObject({ ...refineryFieldRefShape, reason: z.enum(APPLY_DROP_REASONS) }) satisfies z.ZodType<DroppedField>;

export const applyFieldsResultSchema = z.strictObject({
  applied: z.array(appliedFieldRefSchema).readonly(),
  dropped: z.array(droppedFieldSchema).readonly(),
  character: characterDetailSchema,
  snapshotId: typeIdSchema(ID_PREFIX.characterSnapshot).nullable(),
}) satisfies z.ZodType<ApplyFieldsResult>;

export const applyAsCopyResultSchema = applyFieldsResultSchema
  .omit({ snapshotId: true })
  .extend({ character: characterDetailSchema.nullable() }) satisfies z.ZodType<ApplyAsCopyResult>;
