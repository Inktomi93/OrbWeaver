// @orb/contracts/refinery/schema-forge — the NL→schema forge's WIRE GRAMMAR (task #36; the owner's
// 2026-08-09 structured-output VETO of the shipped beg-for-JSON draft: "asking the model to pretty-please
// output proper JSON is fragile as fuck… the prompt describes the task, the grammar owns the shape").
//
// WHAT THIS IS: a flat DESIGN LANGUAGE for payload schemas, plus the total transpiler that turns one into
// the JSON Schema the library stores. The model emits a LEAF LIST — one row per field, nesting carried in a
// `path` string (`issues[].severity`) — and every part of a row that can be a closed vocabulary IS one
// (`type`, `role`, `chart`, tone words). Projected through the ONE projection rule (`projectJsonSchema`,
// D79) the language becomes the `ResponseFormat.schema` every forge call rides, so a constrained backend
// cannot emit a row outside it. The shipped R3 envelope was `{name, schema: z.record(z.string(),
// z.unknown())}` — the grammar constrained the ENVELOPE and nothing inside it, which is the fragility the
// veto names.
//
// WHY A LEAF LIST AND NOT "A JSON SCHEMA CONSTRAINING JSON SCHEMAS" — MEASURED, 2026-08-09, 23 live
// OpenRouter calls with the owner's key. The obvious design (a meta-schema whose `properties` is an open
// `additionalProperties:<node>` key map, recursive or depth-expanded) is NOT SERVABLE:
//   • anthropic/claude-sonnet-5 — HTTP 200 and `{"properties":{},"required":[]}`. The open key map compiles
//     to "no keys permitted", so the model is structurally unable to emit a field and the failure wears a
//     success's clothes. Worse than a 400.
//   • openai/gpt-5.6-luna — 400: "'required' is required to be supplied and to be an array including every
//     key in properties", and under the all-required shape "11 levels of nesting exceeds limit of 10".
//   • google/gemini-3.6-flash — 400 INVALID_ARGUMENT.
//   • the forced-tool vehicle collapses the same map on OpenAI and Gemini (`"properties":{}` again).
//   • `provider.require_parameters` changed NO cell of the 2026-08-09 matrix — TRUE THEN, FALSE NOW: OR's
//     routing changed and by 2026-08-14 `require_parameters:true` 404s every hosted `response_format` call,
//     so it is OMITTED on the structured wire (`backends/openrouter/index.ts`). Still orthogonal to the SHAPE
//     variable this note is about — the leaf-list grammar below is what makes the schema servable.
// The leaf list is arrays of CLOSED objects and nothing else: 200 on all three families under
// `scrubWireSchema(…, "strict-compatible")` + `strict:true` (require_parameters is NO LONGER sent — see above),
// (`issues[].severity` + per-member tones on all of them). It is also 1.4 KB of grammar instead of 34 KB.
//
// THE MIRROR OBLIGATION (owner: "mirror the existing belt exactly so enforcement and validation agree"):
// every document {@link transpileForgeDesign} can produce MUST pass `refinerySchemaDocumentSchema`
// (./schema-authoring.ts). Agreement is one-directional BY DESIGN — the transpiler's range is a SUBSET of
// what the belt accepts, never a superset — because the belt also guards the raw-paste door and
// hand-authored library rows. The correspondence is pinned in
// `tests/contracts/refinery/schema-forge.contract.test.ts`.
//
// WHAT THE GRAMMAR CANNOT OWN (the residue the lift-refusal retry bridge SHRANK to — it used to carry
// the WHOLE belt): the document NAME's identifier grammar and a field `path`'s segment grammar. Both are
// free strings; `pattern` is deliberately never sent to a grammar compiler. Everything else the belt used
// to refuse — a `$ref`, a `oneOf`, a `pattern` inside the schema, a bad hint role, an over-deep nest, a
// missing well-known core — is now UNCONSTRUCTABLE. The belt stays the FINAL authority on every arm and
// every backend: enforcement is an optimization, the belt is the contract.
//
// THE WELL-KNOWN CORE IS SPLICED, NOT ASKED FOR. A custom score schema must carry the exact 1-10
// `overallScore` node and a custom analyze the exact three-spelling `verdict` enum (./schema-authoring.ts's
// header states why). Neither is in the language: the transpiler INJECTS the canonical node and its
// `required` entry ({@link REFINERY_FORGE_CORE_NODES}). That is not a silent auto-fix of model output — it
// is our own contract obligation, applied uniformly, and it turns a retry-able refusal into an impossible
// one. The prompt says so, and the model spends no field on it.
//
// DEVIATION, STATED: `anyOf` is in the owner's sanctioned-vocabulary list and is NOT in this grammar. A
// union node has no expression in a leaf list, unions are the construct every grammar compiler pays
// exponentially for (Anthropic caps union-typed params at 16), and the raw-paste door still accepts one for
// the belt to judge. The renderer keeps its union widget for those.

import { RENDER_HINT_KEY } from "@orb/kit/json-schema";
import { z } from "zod";
import { REFINERY_VERDICTS, SCORE_MAX, SCORE_MIN } from "./core.ts";
import type { RefinerySchemaStage } from "./schema-authoring.ts";
import {
  REFINERY_SCHEMA_DESCRIPTION_MAX,
  REFINERY_SCHEMA_MAX_DEPTH,
  REFINERY_SCHEMA_MAX_ENUM,
  REFINERY_SCHEMA_MAX_PROPERTIES,
  REFINERY_SCHEMA_NAME_MAX,
  RENDER_HINT_ROLES,
  RENDER_HINT_TONES,
} from "./schema-authoring.ts";

// ── the authoring ARMS (owner 2026-08-09: "it's a one-time setup for them so they pay it once, but we
//    should have options") ──────────────────────────────────────────────────────────────────────────────

/** How a forge call is decomposed. One member per PIPELINE SHAPE, dispatched exhaustively at the substrate
 *  (a new member without a runner is a tsc error, §5.5) — never a boolean, never a hardcoded path.
 *
 *  • `single` — ONE enforced call emits the whole design, display hints included. The default: cheapest,
 *    and the shape a small local model handles best when the ask is modest.
 *  • `guided` — STEPWISE construction. One enforced call designs the FIELD PLAN (paths + one-line intents),
 *    then a BATCHED enforced call gives each planned field its own turn against a much smaller grammar, and
 *    we assemble the design. What an RP tool-call round buys — decomposition and undivided attention per
 *    part — on the batch vehicle the `structured` role already speaks. For big or open-ended asks.
 *  • `two-stage` — an enforced STRUCTURE call (no display hints), then a second enforced call that derives
 *    the hints against the finished field list. For when the shape matters more than the look on the first
 *    pass, and for re-hinting a schema that already exists. */
export const REFINERY_FORGE_ARMS = ["single", "guided", "two-stage"] as const;
export type RefineryForgeArm = (typeof REFINERY_FORGE_ARMS)[number];
export const refineryForgeArmSchema = z.enum(REFINERY_FORGE_ARMS) satisfies z.ZodType<RefineryForgeArm>;
/** The arm a caller gets when it expresses no preference (the editor's initial selection). */
export const REFINERY_FORGE_ARM_DEFAULT: RefineryForgeArm = "single";

// ── the leaf language ────────────────────────────────────────────────────────────────────────────────────

/** The leaf types a designed field may take. Containers are never declared — they are IMPLIED by a path
 *  (`issues[].severity` implies an array of objects), which is what keeps the grammar flat. */
export const FORGE_FIELD_TYPES = ["string", "number", "integer", "boolean"] as const;
export type ForgeFieldType = (typeof FORGE_FIELD_TYPES)[number];

/** Leaf rows one design may carry. The cap is the belt's per-object property cap read as a whole-document
 *  budget: a design spreads its leaves across nested objects, so this can only ever be tighter. */
export const REFINERY_FORGE_MAX_FIELDS = REFINERY_SCHEMA_MAX_PROPERTIES;

/** How deep a `path` may nest, counted in SEGMENTS (`a.b.c` = 3). Each array segment costs TWO JSON-Schema
 *  levels (the array node, then its `items`), so the ceiling below is the belt's depth cap halved — the
 *  transpiler's output can then never exceed `REFINERY_SCHEMA_MAX_DEPTH`, which is the agreement direction
 *  the mirror obligation requires. */
export const REFINERY_FORGE_MAX_PATH_SEGMENTS = Math.floor(REFINERY_SCHEMA_MAX_DEPTH / 2);

/** A path segment: an identifier, optionally suffixed `[]` to mean "an array of this". Enforced by the
 *  TRANSPILER, not the grammar (`pattern` never rides a wire — header). */
const PATH_SEGMENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*(\[\])?$/;

/** One authored leaf. Every optional here is a real "the author had nothing to say" — under the hosted
 *  strict shape they arrive as explicit `null`s and `dropNullValues` restores absence at the parse seam. */
export const forgeFieldRowSchema = z
  .object({
    /** Dot path to the leaf; a `[]` suffix on a segment makes that level an array. */
    path: z.string().max(REFINERY_SCHEMA_NAME_MAX * REFINERY_FORGE_MAX_PATH_SEGMENTS),
    type: z.enum(FORGE_FIELD_TYPES),
    description: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX),
    required: z.boolean(),
    /** String leaves only — the closed member list that makes this field an enum. */
    enum: z.array(z.string().max(REFINERY_SCHEMA_NAME_MAX)).min(1).max(REFINERY_SCHEMA_MAX_ENUM).optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    maxLength: z.number().int().min(1).optional(),
    // ── the display vocabulary — flat here, assembled into one `x-orb-ui` by the
    //    transpiler, because a nested hint object is another closed-object level the hosted wires charge for.
    role: z.enum(RENDER_HINT_ROLES).optional(),
    group: z.string().max(REFINERY_SCHEMA_NAME_MAX).optional(),
    label: z.string().max(REFINERY_SCHEMA_NAME_MAX).optional(),
    chart: z.enum(["bars", "radar"]).optional(),
    /** Enum MEMBER → tone word. A PAIR LIST, not a map: an open key map is the exact construct the live probe
     *  showed hosted grammars collapse to "no keys permitted" (header). */
    tones: z
      .array(z.object({ member: z.string().max(REFINERY_SCHEMA_NAME_MAX), tone: z.enum(RENDER_HINT_TONES) }))
      .max(REFINERY_SCHEMA_MAX_ENUM)
      .optional(),
  })
  // #1371 item 1 — `minimum`/`maximum` were independent optionals with no pairing check, and
  // `writeNumericBounds` wrote both VERBATIM, so a design carrying `minimum: 10, maximum: 5` transpiled to
  // `{"type":"number","minimum":10,"maximum":5}` with an empty `dropped` list. That output becomes
  // `ResponseFormat.schema` for provider-constrained decoding, where an UNSATISFIABLE range leaves a
  // guided-decoding backend with no legal token for the field — a stall or a 500 — or, on a loosely
  // validating provider, a value that fails every strict validator downstream.
  //
  // REJECT, never swap: swapping the two would silently rewrite the author's stated intent, and this
  // schema is also what the AUTHORING belt validates through, so the author is the one who should hear
  // about it. Lives on the ROW rather than on each envelope so all three call arms (design, per-field,
  // and the belt) inherit one check. `.refine` on a zod-4 object keeps the object class and its `shape`,
  // so `projectJsonSchema` still walks it — pinned in the suite.
  .refine((row) => row.minimum === undefined || row.maximum === undefined || row.minimum <= row.maximum, {
    error: "minimum must be less than or equal to maximum",
    path: ["maximum"],
  });
export type ForgeFieldRow = z.infer<typeof forgeFieldRowSchema>;

/** The `single` arm's payload, and the `two-stage` arm's first call: a whole design.
 *
 *  `needsRaw` is the HONEST-REFUSAL arm (owner, 2026-08-09: "think about the people who want to do weird
 *  scorings"). The leaf list is the GENERATOR's guaranteed-servable subset, not the product's expressiveness
 *  ceiling — the raw JSON-Schema door beside it takes the full liftable vocabulary (unions, heterogeneous
 *  arrays, deeper nesting) and the belt judges it there. When an ask needs one of those, the model says so
 *  in this field and the editor routes the author to the raw door WITH whatever skeleton the design did
 *  reach, instead of quietly shipping a lossy flat approximation of their idea. We own the grammar, so the
 *  refusal costs one boolean. */
export const forgeDesignEnvelopeSchema = z.object({
  name: z.string().max(REFINERY_SCHEMA_NAME_MAX),
  description: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX),
  fields: z.array(forgeFieldRowSchema).max(REFINERY_FORGE_MAX_FIELDS),
  /** True when the ask needs a construct this leaf list cannot express. `fields` may still carry the part
   *  that DID fit — that becomes the raw door's starter skeleton. */
  needsRaw: z.boolean().optional(),
  /** What the leaf list could not express, in the author's terms. Shown verbatim when `needsRaw`. */
  needsRawReason: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX).optional(),
});
export type ForgeDesignEnvelope = z.infer<typeof forgeDesignEnvelopeSchema>;

/** How many rows one `guided` plan may name — the per-field call fans out one batch item per row. */
export const REFINERY_FORGE_MAX_PLAN_FIELDS = 16;

/** The `guided` arm's FIRST call: paths + intents only. Tiny grammar, all the attention on decomposition. */
export const forgePlanEnvelopeSchema = z.object({
  name: z.string().max(REFINERY_SCHEMA_NAME_MAX),
  description: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX),
  fields: z
    .array(
      z.object({ path: z.string().max(REFINERY_SCHEMA_NAME_MAX * REFINERY_FORGE_MAX_PATH_SEGMENTS), intent: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX) }),
    )
    .min(1)
    .max(REFINERY_FORGE_MAX_PLAN_FIELDS),
});
/** @public twin: forgePlanEnvelopeSchema — the STATIC plan-call shape; the live guided-arm runner projects
 *  the schema value through `projectJsonSchema`/`tolerant()` and never imports this alias (schema value is
 *  cross-package PUBLIC — consumed by the server refinery forge). */
export type ForgePlanEnvelope = z.infer<typeof forgePlanEnvelopeSchema>;

/** The `guided` arm's PER-FIELD call: exactly one finished row. */
export const forgeFieldEnvelopeSchema = z.object({ field: forgeFieldRowSchema });
/** @public twin: forgeFieldEnvelopeSchema — same class as `ForgePlanEnvelope` above: the live consumer
 *  projects/parses the schema value (cross-package PUBLIC), never imports this alias. */
export type ForgeFieldEnvelope = z.infer<typeof forgeFieldEnvelopeSchema>;

/** The `two-stage` arm's SECOND call: display vocabulary only, keyed by the paths the FIRST call fixed. The
 *  structure is ours by then — the model cannot move a field while hinting it. A path that matches no row
 *  is dropped and counted, never applied to a guess. */
export const forgeHintRowSchema = z.object({
  path: z.string().max(REFINERY_SCHEMA_NAME_MAX * REFINERY_FORGE_MAX_PATH_SEGMENTS),
  role: z.enum(RENDER_HINT_ROLES).optional(),
  group: z.string().max(REFINERY_SCHEMA_NAME_MAX).optional(),
  label: z.string().max(REFINERY_SCHEMA_NAME_MAX).optional(),
  chart: z.enum(["bars", "radar"]).optional(),
  tones: z
    .array(z.object({ member: z.string().max(REFINERY_SCHEMA_NAME_MAX), tone: z.enum(RENDER_HINT_TONES) }))
    .max(REFINERY_SCHEMA_MAX_ENUM)
    .optional(),
});
export type ForgeHintRow = z.infer<typeof forgeHintRowSchema>;

export const forgeHintEnvelopeSchema = z.object({ hints: z.array(forgeHintRowSchema).max(REFINERY_FORGE_MAX_FIELDS) });
/** @public twin: forgeHintEnvelopeSchema — same class as `ForgePlanEnvelope` above: the live two-stage-arm
 *  hint call projects/parses the schema value (cross-package PUBLIC), never imports this alias. */
export type ForgeHintEnvelope = z.infer<typeof forgeHintEnvelopeSchema>;

// ── the spliced well-known cores ─────────────────────────────────────────────────────────────────────────

/** The stage's canonical core NODE + its property name — injected into every transpiled design so the
 *  belt's well-known-core refusal is unreachable from the forge (header). Byte-compatible with what
 *  `coreIssueOf` (./schema-authoring.ts) demands; the contract test pins the correspondence. */
/** The verdict banner's tints. Built from `REFINERY_VERDICTS` by INDEX rather than written as an object
 *  literal: the keys are the enum's own uppercase member spellings, and spelling them as identifiers would
 *  both re-declare the vocabulary and read as a naming-convention violation to every linter. */
const VERDICT_TONE_WORDS = ["good", "warn", "bad"] as const;
const VERDICT_TONES: Readonly<Record<string, string>> = Object.fromEntries(
  REFINERY_VERDICTS.map((verdict, i) => [verdict, VERDICT_TONE_WORDS[i] ?? "neutral"]),
);

export const REFINERY_FORGE_CORE_NODES: Readonly<Record<RefinerySchemaStage, { readonly name: string; readonly node: Readonly<Record<string, unknown>> }>> = {
  score: {
    name: "overallScore",
    node: {
      type: "number",
      description: "The weighted overall rating for the card, 1-10.",
      minimum: SCORE_MIN,
      maximum: SCORE_MAX,
      [RENDER_HINT_KEY]: { role: "hero" },
    },
  },
  analyze: {
    name: "verdict",
    node: {
      type: "string",
      description: "ACCEPT when the rewrite is ready, NEEDS_REFINEMENT when it has fixable issues, REGRESSION when it is worse than the original.",
      enum: [...REFINERY_VERDICTS],
      [RENDER_HINT_KEY]: { role: "verdict", tone: VERDICT_TONES },
    },
  },
};

// ── the transpiler ───────────────────────────────────────────────────────────────────────────────────────

/** A row the transpiler could not place, with the reason a human (and the retry prompt) can act on. */
export interface ForgeTranspileDrop {
  readonly path: string;
  readonly reason: string;
}

/** The transpile result: the JSON Schema, plus every row that did NOT make it. Drops are DATA, never
 *  silence (D112 (3), banned-silent-fork) — the verb surfaces the count and the retry quotes the reasons. */
export interface ForgeTranspileResult {
  readonly schema: Record<string, unknown>;
  readonly dropped: readonly ForgeTranspileDrop[];
}

/** The per-TYPE constraint writers. A mapped Record over {@link FORGE_FIELD_TYPES}, not a chain of `if`s:
 *  widening the leaf vocabulary (the expected growth axis — "people who want to do weird scorings") is then
 *  a tsc-guided add, and a new member without a writer cannot compile (§5.5 dispatch discipline). */
const LEAF_CONSTRAINTS: Readonly<Record<ForgeFieldType, (row: ForgeFieldRow, node: Record<string, unknown>) => void>> = {
  string: (row, node) => {
    if (row.enum !== undefined && row.enum.length > 0) {
      node["enum"] = [...row.enum];
    } else if (row.maxLength !== undefined) {
      node["maxLength"] = row.maxLength;
    }
  },
  number: (row, node) => writeNumericBounds(row, node),
  integer: (row, node) => writeNumericBounds(row, node),
  // A boolean leaf carries no constraint keyword — the arm exists so the Record stays exhaustive.
  boolean: () => undefined,
};

function writeNumericBounds(row: ForgeFieldRow, node: Record<string, unknown>): void {
  if (row.minimum !== undefined) {
    node["minimum"] = row.minimum;
  }
  if (row.maximum !== undefined) {
    node["maximum"] = row.maximum;
  }
}

/** One leaf row → its JSON Schema node (constraints + the assembled `x-orb-ui` hint). */
function leafNodeOf(row: ForgeFieldRow): Record<string, unknown> {
  const node: Record<string, unknown> = { type: row.type };
  if (row.description.length > 0) {
    node["description"] = row.description;
  }
  LEAF_CONSTRAINTS[row.type](row, node);
  const hint = hintOf(row);
  if (hint !== null) {
    node[RENDER_HINT_KEY] = hint;
  }
  return node;
}

/** The flat display columns → one `x-orb-ui` object, or null when the author hinted nothing. `tone` only
 *  survives on a node that actually declares the members it names (a tone for a member that is not in the
 *  enum is meaningless to the renderer). */
function hintOf(row: ForgeFieldRow | ForgeHintRow, members?: readonly string[]): Record<string, unknown> | null {
  const hint: Record<string, unknown> = {};
  // The well-known CORE is the sole hero (it is the card's score stamp and every library sort rides its
  // one scale, so the transpiler splices it as `role:"hero"` unconditionally, below). An author row that
  // also claims `role:"hero"` is RE-ROLED here — the hero elevation is dropped, the field itself survives
  // as a plain bounded gauge — so a design never carries two headline numbers and the renderer's
  // order-dependent "first hero wins" can never demote the canonical `overallScore`. (Live custom-schema
  // drive, 2026-08-14: the model designed its own 1-10 rating AND got the spliced core, both hinted hero,
  // and the demoted one was the canonical score.) Every other role (verdict/axis/prose/…) passes through.
  if (row.role !== undefined && row.role !== "hero") {
    hint["role"] = row.role;
  }
  if (row.group !== undefined) {
    hint["group"] = row.group;
  }
  if (row.label !== undefined) {
    hint["label"] = row.label;
  }
  if (row.chart !== undefined) {
    hint["chart"] = row.chart;
  }
  const known = members ?? ("enum" in row ? row.enum : undefined);
  const tones = (row.tones ?? []).filter((t) => known === undefined || known.includes(t.member));
  if (tones.length > 0) {
    hint["tone"] = Object.fromEntries(tones.map((t) => [t.member, t.tone]));
  }
  return Object.keys(hint).length === 0 ? null : hint;
}

/** Split a path into its segments, or null when any segment is outside the segment grammar / the budget. */
function segmentsOf(path: string): readonly string[] | null {
  const segments = path.split(".");
  if (segments.length === 0 || segments.length > REFINERY_FORGE_MAX_PATH_SEGMENTS) {
    return null;
  }
  return segments.every((s) => PATH_SEGMENT_PATTERN.test(s)) ? segments : null;
}

/** The container a path segment addresses: the object node that owns the NEXT segment. A `[]` suffix wraps
 *  that object in an array first. Returns the owning object node, minting it when absent. */
function descend(parent: Record<string, unknown>, segment: string): Record<string, unknown> | null {
  const isArray = segment.endsWith("[]");
  const key = isArray ? segment.slice(0, -2) : segment;
  const properties = parent["properties"] as Record<string, unknown>;
  const existing = properties[key];
  if (existing !== undefined) {
    // Re-entering a container two rows share. A leaf already sitting here is a collision, not a container.
    const node = isArray ? (existing as Record<string, unknown>)["items"] : existing;
    const owner = node as Record<string, unknown> | undefined;
    return owner !== undefined && owner["type"] === "object" ? owner : null;
  }
  const owner: Record<string, unknown> = { type: "object", properties: {}, required: [] };
  properties[key] = isArray ? { type: "array", items: owner } : owner;
  return owner;
}

/** Place one leaf at its path, minting the containers it implies. Returns null on success, a reason
 *  otherwise. */
function placeRow(root: Record<string, unknown>, row: ForgeFieldRow): string | null {
  const segments = segmentsOf(row.path);
  if (segments === null) {
    return `not a usable field path (identifier segments, at most ${REFINERY_FORGE_MAX_PATH_SEGMENTS} deep, "[]" for a list)`;
  }
  let owner = root;
  for (const segment of segments.slice(0, -1)) {
    const next = descend(owner, segment);
    if (next === null) {
      return `"${segment}" is already a value in this schema, so it cannot also hold fields`;
    }
    owner = next;
  }
  const last = segments.at(-1) ?? "";
  const isList = last.endsWith("[]");
  const key = isList ? last.slice(0, -2) : last;
  const properties = owner["properties"] as Record<string, unknown>;
  if (properties[key] !== undefined) {
    return `"${key}" is declared twice`;
  }
  const leaf = leafNodeOf(row);
  properties[key] = isList ? { type: "array", items: leaf } : leaf;
  if (row.required) {
    (owner["required"] as string[]).push(key);
  }
  return null;
}

/** Every object node reachable from the root, so a post-pass can walk containers uniformly. */
function objectNodesOf(node: Record<string, unknown>, path: string, out: { node: Record<string, unknown>; path: string }[]): void {
  out.push({ node, path });
  const properties = node["properties"] as Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(properties ?? {})) {
    const record = child as Record<string, unknown>;
    const inner = record["type"] === "array" ? (record["items"] as Record<string, unknown> | undefined) : record;
    if (inner !== undefined && inner["type"] === "object") {
      objectNodesOf(inner, `${path}.${key}`, out);
    }
  }
}

/** A container object holds its own place in its parent's `required` when ANY of its children is required —
 *  a nested block nobody must fill is an optional block, and the leaf rows are where the author said so. */
function propagateRequired(root: Record<string, unknown>): void {
  const nodes: { node: Record<string, unknown>; path: string }[] = [];
  objectNodesOf(root, "#", nodes);
  for (const { node } of nodes.reverse()) {
    const properties = (node["properties"] ?? {}) as Record<string, unknown>;
    const required = node["required"] as string[];
    for (const [key, child] of Object.entries(properties)) {
      const record = child as Record<string, unknown>;
      const inner = record["type"] === "array" ? (record["items"] as Record<string, unknown> | undefined) : record;
      const childRequired = inner !== undefined && inner["type"] === "object" && Array.isArray(inner["required"]) && inner["required"].length > 0;
      if (childRequired && !required.includes(key)) {
        required.push(key);
      }
    }
  }
}

/**
 * Transpile a designed leaf list into the stored JSON Schema — TOTAL: every row either lands or appears in
 * `dropped` with its reason. The stage's well-known core is spliced last so it always wins (header).
 *
 * OPEN BY CONSTRUCTION — DELIBERATE (task #41): the object nodes minted here carry NO `additionalProperties`.
 * The `additionalProperties:false` pin has ONE home — `projectJsonSchema` (`@orb/kit/json-schema`) — which
 * every refinery WIRE send-site re-applies to this stored blob before it reaches a provider
 * (`domain/refinery/substrate/stage-resolution.ts` and `verbs/test-schema.ts` both do
 * `projectJsonSchema(liftJsonSchema(schema))`). Stamping the pin here too would be a SECOND source of truth
 * for the same invariant and would MASK a future send-site that forgot to project (the stored blob would be
 * incidentally-closed) — so wire-closure is proven at the projection choke point, not duplicated here. A
 * probe (#41) confirmed the hosted wire (`hosted-common`/`anthropic-format`) ships CLOSED via that path; on
 * the forced-tool hosted vehicle the pin is advisory regardless (grammar enforcement is guided-decoding only).
 */
export function transpileForgeDesign(design: ForgeDesignEnvelope, stage: RefinerySchemaStage): ForgeTranspileResult {
  const core = REFINERY_FORGE_CORE_NODES[stage];
  const root: Record<string, unknown> = { type: "object", description: design.description, properties: {}, required: [] };
  const dropped: ForgeTranspileDrop[] = [];
  for (const row of design.fields) {
    // The core is ours; a row that tries to redefine it is dropped rather than merged (one authority).
    if (row.path === core.name) {
      dropped.push({ path: row.path, reason: `"${core.name}" is added automatically for this stage` });
      continue;
    }
    const reason = placeRow(root, row);
    if (reason !== null) {
      dropped.push({ path: row.path, reason });
    }
  }
  propagateRequired(root);
  const properties = root["properties"] as Record<string, unknown>;
  properties[core.name] = { ...core.node };
  root["required"] = [core.name, ...(root["required"] as string[]).filter((n) => n !== core.name)];
  return { schema: root, dropped };
}

/** Apply the `two-stage` arm's hint rows onto a design's field rows, by path. Returns the merged design and
 *  how many hint rows addressed a path the design does not have (dropped, counted, never guessed). */
export function applyForgeHints(
  design: ForgeDesignEnvelope,
  hints: readonly ForgeHintRow[],
): { readonly design: ForgeDesignEnvelope; readonly unmatched: number } {
  const byPath = new Map<string, ForgeHintRow>(hints.map((h) => [h.path, h]));
  const fields = design.fields.map((row) => {
    const hint = byPath.get(row.path);
    if (hint === undefined) {
      return row;
    }
    byPath.delete(row.path);
    return {
      ...row,
      ...(hint.role !== undefined ? { role: hint.role } : {}),
      ...(hint.group !== undefined ? { group: hint.group } : {}),
      ...(hint.label !== undefined ? { label: hint.label } : {}),
      ...(hint.chart !== undefined ? { chart: hint.chart } : {}),
      ...(hint.tones !== undefined ? { tones: hint.tones } : {}),
    };
  });
  return { design: { ...design, fields }, unmatched: byPath.size };
}
