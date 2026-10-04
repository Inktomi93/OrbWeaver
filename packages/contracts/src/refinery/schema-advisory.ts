// @orb/contracts/refinery/schema-advisory — the raw-door preflight: what a schema that passes the save belt still
// costs on a hosted wire. Advisories never block. Every wire claim is the structured layer's own scrub, never a
// vendor table re-declared here; whether the bound model takes the schema is `schema-plan.ts`'s, server-side.

import type { Unprojected } from "@orb/kit/json-schema";
import { RENDER_HINT_KEY } from "@orb/kit/json-schema";
import { checkWireSchema, HOSTED_INTERSECTION_TARGET } from "#inference";

/** One advisory class. A closed union so the editor's copy is a mapped Record and a new class cannot ship without
 *  a sentence for it. */
export const REFINERY_ADVISORY_CODES = ["wire-bounds-stripped", "anyof-variants"] as const;
export type RefineryAdvisoryCode = (typeof REFINERY_ADVISORY_CODES)[number];

/** One advisory: what, where, and why it matters — in the author's terms, never the mechanism's. */
export interface RefinerySchemaAdvisory {
  readonly code: RefineryAdvisoryCode;
  /** JSON-pointer-ish path to the node it is about (`#` for a whole-document accounting claim). */
  readonly path: string;
  readonly message: string;
}

/** The accounting readout an author reasons about a schema's size with. */
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

/** Variants in one authored anyOf past which hosted grammar compilers get slow (the card-refinery extension's
 *  `MAX_ANYOF_VARIANTS`). Advisory only: the belt permits any count. */
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

/**
 * Preflight one authored schema on the hosted wire: the accounting, and the keywords a hosted request drops. Total
 * and non-throwing — it runs on every keystroke of the raw JSON door over a draft the belt has not judged, so a shape
 * it cannot make sense of yields no advisories. Whether the bound model takes the schema at all is the server's
 * plan (`refinerySchemaPlanSchema`), not a claim made here.
 *
 * Errors are not here: a refusal is the save belt's (`refinerySchemaDocumentSchema`).
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
  const wire = checkWireSchema([schema], HOSTED_INTERSECTION_TARGET.mode, undefined).wire[0] ?? {};
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
  advisories.push(...state.advisories);
  return { stats, advisories };
}
