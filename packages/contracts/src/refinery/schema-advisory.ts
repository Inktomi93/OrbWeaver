// @orb/contracts/refinery/schema-advisory — the raw-door PREFLIGHT: what a schema that PASSES the belt
// still costs on a real wire. Three tiers, and only the first two existed before this file:
//   ERROR    — the belt refuses the save (./schema-authoring.ts). Unchanged here; never re-implemented.
//   ADVISORY — this file. The schema is valid and WILL save; these are the facts a hosted round-trip will
//              impose on it anyway (a bound that does not ride the wire, an optional-field fan-out).
//   STATS    — the accounting an author needs to reason about a schema's size before spending a call.
// Advisories NEVER block. Nothing here can refuse anything: the return value is data the editor paints.
//
// THE RULING FORK — RECONCILED 2026-08-14 (task #36 follow-up). It was raised as "orchestrator's to
// reconcile" and it has been: the ADVISORY posture below is RATIFIED, and the fork is closed. A #36 brief
// asked for these to become hard REFUSALS at the transpile layer, at ≤24 optionals / ≤16 unions. Both halves
// lost. Posture: a refusal would reverse §1's "providers own their wire" ruling AND task #40's
// bounds→description relay, neither of which is this file's to overturn. Numbers: 46 and 8 are MEASURED and
// carry the receipts cited under SOURCE-PINNED below, while 24/16 were written from probe-era notes and cite
// nothing — measured beats remembered. The paragraph that follows is the original statement of the fork,
// kept because it is the argument that won.
//
// `docs/design/refinery-schema-renderer.md` §1's
// last table row rules the OG's `validate.ts` ACCIDENTAL — "Client-side re-implementation of provider
// schema law … dies to `liftJsonSchema`/`scrubWireSchema`/`runStructuredTurn`" (port study §2 E3: "the
// extension's validator polices ANTHROPIC limits client-side because it had no server; orb's providers own
// their wire"). That ruling is HONOURED, not reversed: no vendor limit is re-declared here and nothing is
// policed. Every wire claim this file makes is DERIVED by running `scrubWireSchema` — our own wire
// vocabulary, the single home of that law — and diffing the result against the input. If a wire's subset
// changes, these advisories change with it, because they are literally its output. What the OG contributes
// is the two ACCOUNTING THRESHOLDS below (the steal ledger's §11 posture: take the scar, not the code).
//
// SOURCE-PINNED NUMBERS
//   • the stripped keyword set — NOT a constant here: read off `scrubWireSchema(schema, "hosted-common")`.
//   • the optional-field ceiling 46 — OURS, measured: "Anthropic's grammar compiler refuses a schema for
//     having too many OPTIONALS (an undocumented runtime ceiling, measured at 46)"
//     (`@orb/kit/json-schema/wire-subset.ts`, the `strict-compatible` note).
//   • 10 optionals / 50 total anyOf variants — the OG extension's own table
//     (`references/card-refinery/src/domain/schema/validate.ts:180-195`), kept as the ADVISORY thresholds
//     they always were there (it warned; it never errored on them).
//   • 8 variants per anyOf — the OG's `ANTHROPIC_LIMITS.MAX_ANYOF_VARIANTS` (`constants.ts:12`). Advisory
//     only: our belt permits any count, and the raw door is exactly where a union gets authored.
// Deliberately ABSENT (they would be phantoms — our belt is STRICTER than the OG's limit, so the arm is
// unreachable): nesting depth (belt 8 < OG 10), enum members (32 < 500), properties per object (64 < 100),
// `$defs` (unliftable), `format` (unliftable), regex features (`pattern` is refused outright).
//
// ALSO ABSENT, ON PURPOSE — the OG's `additionalProperties: false` warning (`validate.ts:355-359`). It is a
// true statement about our hosted wire (`hosted-common` has `pinClosed: false`, so an open object ships
// open), but `transpileForgeDesign` emits NO `additionalProperties` on any node, so the advisory would fire
// on 100% of drafts this app's own generator produces. A warning that is always on is not a warning. The
// honest fix lives in the transpiler, not in the editor's readout — raised to the orchestrator, not
// papered over here.

import type { Unprojected } from "@orb/kit/json-schema";
import { RENDER_HINT_KEY, scrubWireSchema } from "@orb/kit/json-schema";

/** One advisory CLASS. A closed union so the editor's copy is a mapped Record and a new class cannot ship
 *  without a sentence for it (§5.5 dispatch discipline). */
export const REFINERY_ADVISORY_CODES = ["wire-bounds-stripped", "optional-nullable-fan", "optional-ceiling", "anyof-variants"] as const;
export type RefineryAdvisoryCode = (typeof REFINERY_ADVISORY_CODES)[number];

/** One advisory: what, where, and why it matters — in the author's terms, never the mechanism's. */
export interface RefinerySchemaAdvisory {
  readonly code: RefineryAdvisoryCode;
  /** JSON-pointer-ish path to the node it is about (`#` for a whole-document accounting claim). */
  readonly path: string;
  readonly message: string;
}

/** The accounting readout (the OG's `ctx.stats` info line, minus the fields our belt makes unreachable). */
export interface RefinerySchemaStats {
  readonly properties: number;
  readonly optionalFields: number;
  readonly anyOfBlocks: number;
  readonly anyOfVariants: number;
  readonly enums: number;
  readonly maxDepth: number;
}

export interface RefinerySchemaAssessment {
  readonly stats: RefinerySchemaStats;
  readonly advisories: readonly RefinerySchemaAdvisory[];
}

// ── the OG's accounting thresholds (header) ──────────────────────────────────────────────────────────────

/** Optional fields past which the implicit-nullable fan-out is worth naming (OG `validate.ts:184`). */
const OPTIONAL_FAN_THRESHOLD = 10;
/** Total anyOf VARIANTS (authored + 2 per implicit nullable) past which compilation gets slow (OG `:190`). */
const TOTAL_ANYOF_VARIANT_THRESHOLD = 50;
/** Each optional field becomes `anyOf: [<schema>, {"type":"null"}]` — two variants (`wire-subset.ts`). */
const VARIANTS_PER_NULLABLE = 2;
/** The MEASURED Anthropic optional ceiling (ours — `wire-subset.ts`'s `strict-compatible` note). */
const OPTIONAL_CEILING = 46;
/** Variants in one authored anyOf past which hosted grammar compilers complain (OG `constants.ts:12`). */
const MAX_ANYOF_VARIANTS = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** One schema node PAIRED with its counterpart in the hosted wire copy, plus where it sits. The walk
 *  carries this as ONE value: the node and its wire twin are only ever meaningful together. */
interface PairedNode {
  readonly node: Record<string, unknown>;
  readonly wire: Record<string, unknown> | undefined;
  readonly path: string;
  readonly depth: number;
}

/** Read one key off the wire copy as a schema node (undefined when the wire dropped or reshaped it). */
function wireNode(wire: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = wire?.[key];
  return isRecord(value) ? value : undefined;
}

/** The child schema nodes of one node, with their wire counterparts — the SAME enumeration the save belt
 *  walks (`childrenOf`, ./schema-authoring.ts), so the two never disagree about what a node is. The scrub
 *  preserves structure (it only removes keywords), so the pairing is positional and total. */
function propertyChildrenOf({ node, wire, path, depth }: PairedNode): readonly PairedNode[] {
  const properties = node["properties"];
  if (!isRecord(properties)) {
    return [];
  }
  const wireProperties = wireNode(wire, "properties");
  return Object.keys(properties).flatMap((key) => {
    const child = properties[key];
    return isRecord(child) ? [{ node: child, wire: wireNode(wireProperties, key), path: `${path}/properties/${key}`, depth: depth + 1 }] : [];
  });
}

function itemChildOf({ node, wire, path, depth }: PairedNode): readonly PairedNode[] {
  const items = node["items"];
  return isRecord(items) ? [{ node: items, wire: wireNode(wire, "items"), path: `${path}/items`, depth: depth + 1 }] : [];
}

function unionChildrenOf({ node, wire, path, depth }: PairedNode): readonly PairedNode[] {
  const anyOf = node["anyOf"];
  if (!Array.isArray(anyOf)) {
    return [];
  }
  const wireAnyOf = wire?.["anyOf"];
  const wireMembers = Array.isArray(wireAnyOf) ? wireAnyOf : [];
  return anyOf.flatMap((member, i) => {
    const wireMember = wireMembers[i];
    return isRecord(member) ? [{ node: member, wire: isRecord(wireMember) ? wireMember : undefined, path: `${path}/anyOf/${i}`, depth: depth + 1 }] : [];
  });
}

function pairedChildrenOf(target: PairedNode): readonly PairedNode[] {
  return [...propertyChildrenOf(target), ...itemChildOf(target), ...unionChildrenOf(target)];
}

/** Mutable accumulator for the single walk (the stats + the per-node advisories). */
interface WalkState {
  properties: number;
  optionalFields: number;
  anyOfBlocks: number;
  anyOfVariants: number;
  enums: number;
  maxDepth: number;
  readonly strippedKeys: Set<string>;
  readonly advisories: RefinerySchemaAdvisory[];
}

/** THE WIRE READ. A key the authored node has and the wire copy does not is a key this wire does not
 *  carry — whoever decided that and for whatever reason (no vendor table is consulted; header). Skipped
 *  entirely when the pairing failed: a missing counterpart is an unknown, and reporting every keyword as
 *  stripped would be a confident wrong answer. */
function collectStripped({ node, wire }: PairedNode, state: WalkState): void {
  if (wire === undefined) {
    return;
  }
  for (const key of Object.keys(node)) {
    // The render-hint channel is ours and never rides a wire — its absence downstream is by design.
    if (key !== RENDER_HINT_KEY && !(key in wire)) {
      state.strippedKeys.add(key);
    }
  }
}

/** THE ACCOUNTING for one node: its property/optional/enum/union counts, plus the union's own advisory. */
function collectShape({ node, path }: PairedNode, state: WalkState): void {
  const properties = node["properties"];
  if (isRecord(properties)) {
    const keys = Object.keys(properties);
    state.properties += keys.length;
    const required = new Set<string>(Array.isArray(node["required"]) ? node["required"].filter((r): r is string => typeof r === "string") : []);
    state.optionalFields += keys.filter((k) => !required.has(k)).length;
  }
  if (Array.isArray(node["enum"])) {
    state.enums += 1;
  }
  const anyOf = node["anyOf"];
  if (!Array.isArray(anyOf)) {
    return;
  }
  state.anyOfBlocks += 1;
  state.anyOfVariants += anyOf.length;
  if (anyOf.length > MAX_ANYOF_VARIANTS) {
    state.advisories.push({
      code: "anyof-variants",
      path,
      message: `${anyOf.length} alternatives in one union — hosted grammar compilers get slow or refuse past about ${MAX_ANYOF_VARIANTS}. It will still save; consider splitting the choice.`,
    });
  }
}

/** ONE lockstep walk over the authored tree and its HOSTED WIRE COPY (header). */
function walk(target: PairedNode, state: WalkState): void {
  state.maxDepth = Math.max(state.maxDepth, target.depth);
  collectStripped(target, state);
  collectShape(target, state);
  for (const child of pairedChildrenOf(target)) {
    walk(child, state);
  }
}

/** The document-level accounting advisories (the OG's two thresholds + our measured ceiling). */
function fanAdvisories(stats: RefinerySchemaStats): readonly RefinerySchemaAdvisory[] {
  const out: RefinerySchemaAdvisory[] = [];
  const implicitVariants = stats.optionalFields * VARIANTS_PER_NULLABLE;
  const totalVariants = stats.anyOfVariants + implicitVariants;
  if (stats.optionalFields > OPTIONAL_CEILING) {
    out.push({
      code: "optional-ceiling",
      path: "#",
      message: `${stats.optionalFields} optional fields. Under the strict-compatible output shape (Settings › Admin › Structured output) every optional becomes a "or null" alternative, and Anthropic's grammar compiler has been measured refusing schemas past about ${OPTIONAL_CEILING} of them. Make the ones you always want REQUIRED.`,
    });
  } else if (stats.optionalFields > OPTIONAL_FAN_THRESHOLD) {
    out.push({
      code: "optional-nullable-fan",
      path: "#",
      message: `${stats.optionalFields} optional fields. Under the strict-compatible output shape each one becomes a "or null" alternative, which the model pays attention for. Marking the ones you always want as required costs nothing and sharpens the answer.`,
    });
  }
  if (totalVariants > TOTAL_ANYOF_VARIANT_THRESHOLD) {
    out.push({
      code: "optional-nullable-fan",
      path: "#",
      message: `about ${totalVariants} total alternatives once the optional fields are counted — big schemas compile slowly on hosted endpoints and answer less precisely. Consider splitting this into two schemas.`,
    });
  }
  return out;
}

/**
 * PREFLIGHT one authored schema: the accounting, plus every advisory the hosted wire's own behaviour
 * implies. Total and non-throwing — it is called on every keystroke of the raw JSON door, over a draft the
 * belt has not judged yet, so a shape it cannot make sense of yields empty advisories, never an exception.
 *
 * Errors are NOT here: a refusal is the save belt's (`refinerySchemaDocumentSchema`), verbatim, and this
 * function never duplicates one.
 */
export function refinerySchemaAdvisoryOf(schema: Unprojected): RefinerySchemaAssessment {
  const state: WalkState = {
    properties: 0,
    optionalFields: 0,
    anyOfBlocks: 0,
    anyOfVariants: 0,
    enums: 0,
    maxDepth: 0,
    strippedKeys: new Set<string>(),
    advisories: [],
  };
  // The wire copy the hosted request would actually carry — the ONE home of which keywords survive.
  const wire = scrubWireSchema(schema, "hosted-common").schema;
  walk({ node: schema, wire, path: "#", depth: 0 }, state);

  const stats: RefinerySchemaStats = {
    properties: state.properties,
    optionalFields: state.optionalFields,
    anyOfBlocks: state.anyOfBlocks,
    anyOfVariants: state.anyOfVariants,
    enums: state.enums,
    maxDepth: state.maxDepth,
  };
  const advisories: RefinerySchemaAdvisory[] = [];
  if (state.strippedKeys.size > 0) {
    const named = [...state.strippedKeys].sort().join(", ");
    advisories.push({
      code: "wire-bounds-stripped",
      path: "#",
      message: `valid — but ${named} ${state.strippedKeys.size === 1 ? "does" : "do"} not ride a hosted request: the endpoint never sees ${state.strippedKeys.size === 1 ? "it" : "them"}, so ${state.strippedKeys.size === 1 ? "it is" : "they are"} enforced when the answer comes back, not while the model writes it. Say what you want in the field's description too.`,
    });
  }
  advisories.push(...fanAdvisories(stats), ...state.advisories);
  return { stats, advisories };
}
