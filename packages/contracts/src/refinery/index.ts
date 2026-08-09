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

import type { ModelId, RefinerySchemaId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { liftJsonSchema } from "@orb/kit/json-schema";
import { estimateTokens } from "@orb/kit/tokens";
import { z } from "zod";
import { refineryVerdictSchema, SCORE_MAX, SCORE_MIN } from "./core.ts";

export { REFINERY_VERDICTS, type RefineryVerdict, refineryVerdictSchema, SCORE_MAX, SCORE_MIN } from "./core.ts";
// The refinery prose slot table (R1) — composed into `PROSE_SLOTS` by `#prose` through this front door.
export { REFINERY_PROSE_SLOTS } from "./prose.ts";
export * from "./schema-authoring.ts";

// The 1-10 rubric bounds + the verdict vocabulary live in ./core.ts (schema-authoring's well-known-core
// check needs them and this file re-exports ./schema-authoring — importing them back out of here would
// close a cycle).
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
// keyword — so it survives `projectJsonSchema` as `maxLength`/`maxItems` and is GRAMMAR-ENFORCED on the
// guided-decoding wire, while the hosted wires strip it and the zod belt re-imposes it on the reply
// (`kit/json-schema/wire-subset` states that contract). Critique prose additionally carries the ONE
// sanctioned refinement (the token cap — see the header).

/** The product cap for one free-prose critique string (`summary`, `soulAssessment`, a per-field critique),
 *  in TOKENS. OWNER RULING 2026-08-08 — the cap was 4 000 CHARS (the `PROSE_MAX_CHARS` twin) and that was
 *  the wrong UNIT for model-authored prose: "we are thinking in chars but it needs to be tokens ... 1000
 *  tokens is piddly, I have cards that are like 4k". Measured by `@orb/kit/tokens`, the ONE production
 *  estimator (never a re-implementation) — which makes this cap the same currency as every prompt budget
 *  in the tree. */
const CRITIQUE_TOKEN_MAX = 4000;

/** The most characters ONE token can buy under the production estimator. `estimateTokens` (QuadChars,
 *  `@orb/kit/tokens`) charges a printable-ASCII run 1 token per 4 chars and EVERY other codepoint a whole
 *  token, so `estimateTokens(t) >= ceil(t.length / 4)` holds for every string — 4 is the ceiling, reached
 *  only by pure printable ASCII.
 *
 *  THIS IS A PREMISE, NOT A CONSTANT: if the estimator is ever swapped for a real BPE (where common words
 *  routinely exceed 4 chars per token) the inequality above becomes FALSE and the derivation below must be
 *  revisited in that same change. Deriving the backstop instead of writing `16_000` is what forces that —
 *  a literal would silently outlive its premise. */
const QUADCHARS_MAX_CHARS_PER_TOKEN = 4;

/** The DoS backstop for one critique string, in CHARS — the NATIVE keyword that survives projection and
 *  keeps the guided-decoding grammar preventing over-long prose at generation time (a grammar cannot count
 *  tokens). DERIVED, so it is exactly the char envelope of the token cap: by the inequality above a
 *  token-legal string is always within `4 × budget` chars, so this rejects NOTHING the token cap accepts
 *  while bounding bytes at half of the flat 32 000 a hand-picked literal would have cost.
 *
 *  It is deliberately NOT the whole belt: non-ASCII prose costs a token PER CODEPOINT, so 5 000 CJK
 *  characters is 5 000 tokens at only 5 000 chars — over the product cap and nowhere near this backstop.
 *  That gap is precisely why the token refinement exists. */
const CRITIQUE_CHAR_BACKSTOP = CRITIQUE_TOKEN_MAX * QUADCHARS_MAX_CHARS_PER_TOKEN;

/** One free-prose critique string, DUAL-BOUND: a native char backstop (projected to the wire, grammar-
 *  enforced on vLLM) plus the token product cap (parse-only — see the header's sanctioned-refinement note).
 *
 *  The `length` guard in front of `estimateTokens` is LOAD-BEARING, not defensive: zod string checks are
 *  NON-ABORTING, so without it a blob that already failed `.max()` would still be walked codepoint-by-
 *  codepoint by the estimator — the byte ceiling would have become a CPU amplifier (measured: 40 MB ≈ 1.9 s
 *  of tokenizing for a string already known to be refused). Answering `false` on length alone is exact, not
 *  an approximation: over `4 × budget` chars is over budget in tokens by the inequality above. */
const critiqueProseSchema = z
  .string()
  .max(CRITIQUE_CHAR_BACKSTOP)
  .refine((text) => text.length <= CRITIQUE_CHAR_BACKSTOP && estimateTokens(text) <= CRITIQUE_TOKEN_MAX, `must be at most ${CRITIQUE_TOKEN_MAX} tokens`);

/** Host-authored free prose that reaches a model wire (session `guidance`) — the `PROSE_MAX_CHARS` twin
 *  (contracts/prose-slot), and deliberately still CHARS. It is a typed input field, not model-authored
 *  critique output: a human types it into a bounded control, so the char cap is the one the editor can show
 *  and the token ruling above does not reach it. */
const HOST_PROSE_MAX_CHARS = 4000;
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
export const refineryStageSchema = z.enum(REFINERY_STAGES);

// (REFINERY_VERDICTS / refineryVerdictSchema re-homed to ./core.ts — see the note above.)

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
export type RefineryScoreFixedConfig = z.infer<typeof refineryScoreFixedConfigSchema>;

export const refineryRewriteConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryRewriteModeSchema,
});
export type RefineryRewriteConfig = z.infer<typeof refineryRewriteConfigSchema>;

export const refineryAnalyzeFixedConfigSchema = z.object({
  kind: z.literal("fixed"),
  mode: refineryAnalyzeModeSchema,
});
export type RefineryAnalyzeFixedConfig = z.infer<typeof refineryAnalyzeFixedConfigSchema>;

/** The SESSION-side custom arm — a pointer at an owned `refinery_schemas` row. `brandedId`, not
 *  `typeIdSchema`: the id is an INPUT the verb immediately resolves against the owned table (the lookup
 *  is the real belt), and stored config blobs re-parse through this at the read seam — a length-strict
 *  parse would heal a whole session config over an id-shape nit. */
export const refineryCustomStageConfigSchema = z.object({
  kind: z.literal("custom"),
  schemaId: brandedId<RefinerySchemaId>(),
});
export type RefineryCustomStageConfig = z.infer<typeof refineryCustomStageConfigSchema>;

/** Session score config: fixed mode, or a custom schema pointer. */
export const refineryScoreConfigSchema = z.union([refineryScoreFixedConfigSchema, refineryCustomStageConfigSchema]);
export type RefineryScoreConfig = z.infer<typeof refineryScoreConfigSchema>;

/** Session analyze config: fixed mode, or a custom schema pointer. */
export const refineryAnalyzeConfigSchema = z.union([refineryAnalyzeFixedConfigSchema, refineryCustomStageConfigSchema]);
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

/** The RUN-side custom provenance arm — SELF-CONTAINED per the P1-B ruling
 *  (docs/design/refinery-schema-renderer.md §9.1): the run log is append-only forever, so a run EMBEDS
 *  the schema it was produced under (depth-capped objects are small; runs are per-user artifacts, dedupe
 *  is not worth a join) plus the schema row's `version` at run time. The renderer and the read-seam
 *  re-parse never dereference a live `refinery_schemas` row for a historical run — "the schema is gone"
 *  is unrepresentable rather than a state the run viewer has to survive. The session-side POINTER arm
 *  above is the mutable half; the resolve-and-embed happens inside `runStage`. */
export const refineryCustomRunConfigSchema = z.object({
  kind: z.literal("custom"),
  schemaId: brandedId<RefinerySchemaId>(),
  schemaVersion: z.number().int().min(1),
  schema: z.record(z.string(), z.unknown()),
});
export type RefineryCustomRunConfig = z.infer<typeof refineryCustomRunConfigSchema>;

/** The RUN-side manual-rewrite provenance arm — a HAND-authored rewrite (og-extension-feedback gap 1,
 *  the ShadowKyogre fork: score → hand-edit → analyze). No mode, no model, no schema: the payload is the
 *  same typed rewrite contract, authored by the owner in the WIP edit area instead of a model. */
export const refineryManualRewriteConfigSchema = z.object({
  kind: z.literal("manual"),
});
export type RefineryManualRewriteConfig = z.infer<typeof refineryManualRewriteConfigSchema>;

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
export const refineryFieldScoreSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.number().int().min(0).max(GREETING_INDEX_MAX).optional(),
  score: z.number().min(SCORE_MIN).max(SCORE_MAX),
  strengths: critiqueProseSchema,
  weaknesses: critiqueProseSchema,
  suggestions: critiqueProseSchema,
});
/** @public type twin of `refineryFieldScoreSchema` — the per-field score ROW. Its consumer is the R3 refinery
 *  SURFACE (design-gated on the owner's mockup ruling, board C15), which maps
 *  `refineryScorePayloadSchema.fieldScores` into rendered per-field rows. R1 only ever handles the payload
 *  whole, and R2 (the client data tier, shipped) deliberately types through the tRPC WIRE types —
 *  `inferInput`/`inferOutput` off the options proxy, so a router reshape breaks at the hook rather than at a
 *  hand-picked alias — which is why the row type still has no importer. Do not re-try consuming it from the
 *  data tier: this alias belongs to whatever RENDERS a score row. (Amended 2026-08-08: the reason previously
 *  named R2 as the consumer; R2 landed without one.) */
export type RefineryFieldScore = z.infer<typeof refineryFieldScoreSchema>;

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
  greetingIndex: z.number().int().min(0).max(GREETING_INDEX_MAX).optional(),
};

/** One rewritten field — a TWO-ARM union: replace the text, or EMPTY the field.
 *
 *  EMPTYING IS REFINING (owner ruling 2026-08-08, overruling the R0 stance that lived on this comment —
 *  "why wouldn't they be able to empty personality? They can fill it therefore they can empty it").
 *  Consolidating several fields into one REQUIRES clearing the donors, so the pipeline must be able to say
 *  it. Design: docs/design/refinery-schema-renderer.md §15.
 *
 *  WHY A TAGGED ARM AND NOT `text: ""` (§15.1 — all three reasons are load-bearing):
 *   • GRAMMAR HONESTY. `text` keeps `min(1)`, so the projected `minLength` is unchanged on every wire and
 *     `""` never becomes a semantics-bearing token — "the model emitted nothing" stays distinguishable
 *     from "the user's consolidation emptied this field".
 *   • MODEL LEGIBILITY. A small model handles `{"field":"scenario","cleared":true}` far better than an
 *     empty string that means something, and the guided-decoding grammar enforces the arm exactly.
 *   • ANTI-SNIFFING. `""`-as-clear is one more data-sniffed convention — the failure class the whole
 *     schema-driven design exists to kill.
 *
 *  `text` caps at the card TEXT_MAX twin so an accepted rewrite always satisfies `character.update`.
 *  ARM ORDER IS THE NON-DESTRUCTIVE READ: a malformed entry carrying BOTH keys parses as a replacement and
 *  the `cleared` key strips — which lands it in the run row's `strippedKeys` itemization rather than
 *  silently destroying a field (belt 6). Spelled as a plain union, not a discriminated one: the tag is
 *  optional on one arm, which `z.discriminatedUnion` cannot express. */
export const refineryRewriteFieldSchema = z.union([
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
  soulAssessment: critiqueProseSchema,
  verdict: refineryVerdictSchema,
  issues: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
  recommendations: z.array(z.string().max(NOTE_MAX)).max(LIST_MAX),
});
export type RefineryAnalyzePayload = z.infer<typeof refineryAnalyzePayloadSchema>;

export type RefineryStagePayload = RefineryScorePayload | RefineryRewritePayload | RefineryAnalyzePayload;

/** The exhaustive per-stage FIXED payload-schema dispatch (spine §7.5 mapped-Record). Since the custom
 *  arm landed this is no longer the whole dispatch home — {@link payloadSchemaFor} is: fixed/manual runs
 *  resolve here, custom runs lift their EMBEDDED schema. A new stage member fails tsc here first. */
export const REFINERY_STAGE_PAYLOADS = {
  score: refineryScorePayloadSchema,
  rewrite: refineryRewritePayloadSchema,
  analyze: refineryAnalyzePayloadSchema,
} as const satisfies Record<RefineryStage, z.ZodType>;

/** THE payload-schema dispatch (schema-renderer §9.6 — the honest one-home once the custom arm exists):
 *  a fixed or manual run parses the stage's typed contract; a custom run parses the schema EMBEDDED in
 *  its own provenance (never a live row — P1-B). Throws `JsonSchemaLiftError` only on a corrupt embed,
 *  which the read seam treats as the payload-no-longer-parses heal. */
export function payloadSchemaFor(stage: RefineryStage, payloadConfig: RefineryStagePayloadConfig): z.ZodType {
  return payloadConfig.kind === "custom" ? liftJsonSchema(payloadConfig.schema) : REFINERY_STAGE_PAYLOADS[stage];
}

// ── The stage-SYSTEM shape restatement (schema-renderer §9.3) ────────────────────────────────────────────
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

// ── Wire views (tRPC outputs; the FULL session view with `originalCard` homes in domain/refinery's
//    contract/ (R1) — it needs `#character`, which this file must not import) ───────────────────────────

const refineryRunBaseSchema = z.object({
  id: typeIdSchema(ID_PREFIX.refineryRun),
  sessionId: typeIdSchema(ID_PREFIX.refinerySession),
  /** Which refinement round produced this run (0 = the initial pass; `iterate` increments). */
  iteration: z.number().int().min(0),
  /** Null on exactly the `manual` provenance arm — a hand-authored rewrite has no model, and an honest
   *  null beats a sentinel spelling (the anti-sniffing law). */
  model: brandedId<ModelId>().nullable(),
  /** Provider-reported usage, or null when the backend reports none (stats parity). */
  promptTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
  /** The run's WALL TIME in ms — the Runs ledger's third economic column beside the two token counts
   *  (`qwen3-32b · 4 210 in / 512 out · 6.1s`). Measured by the injected clock across the whole stage
   *  pass, so it includes prompt assembly and the bounded structured retry, which is what a user
   *  comparing two runs actually waited. Never null: a run that produced a row took some time. */
  durationMs: z.number().int().min(0),
  /** The DAG PARENT: the run whose output this one CONSUMED — an analyze names the rewrite it judged, a
   *  rewrite names the score (or, on a refinement round, the analyze) it worked from. Null on a run that
   *  read no prior run.
   *
   *  WHY IT IS A COLUMN AND NOT AN INFERENCE (docs/design/refinery-schema-renderer.md §21 edge 1): the
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
  createdAt: z.number().int(),
});

/** A custom run's payload on the wire: shape-valid against its EMBEDDED schema at write AND at the read
 *  seam — the wire type is the honest "an object of the run's own schema" (the client renders it through
 *  the render plan derived from that same embed, never through the fixed contracts). */
const customPayloadSchema = z.record(z.string(), z.unknown());

/** One append-only pipeline run. A plain union (not `z.discriminatedUnion`): score/analyze each carry TWO
 *  arms per stage literal (fixed + custom), which a single-key discriminator cannot spell. Narrow by
 *  `stage`, then by `payloadConfig.kind` — the provenance and the payload type move together. */
export const refineryRunSchema = z.union([
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
