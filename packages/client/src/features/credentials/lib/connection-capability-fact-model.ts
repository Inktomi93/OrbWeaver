// "What this server accepts" — the capability half of the connection editor's fact-row grammar
// (`connection-fact-model.ts` owns the grammar and the quirk rows). A capability row cannot be attributed per
// field, so it states the folded value, "assumed" where the fold marks a floor guess, and the baseline it replaced.

import type { Capability, DeclaredCapability } from "@orb/contracts/inference";
import { REASONING_MODES } from "@orb/contracts/inference";
import type { FactLeaf, FactRow } from "./connection-fact-model.ts";
import { draftOf, formatLeaf, NOT_STATED, readPath, tokens, unsetRow } from "./connection-fact-model.ts";

/** The source line for a capability row this client cannot attribute per field. Deliberately NOT one of the
 *  mock's invented strings — see `connection-fact-model.ts`'s header. */
const CAPABILITY_SOURCE = "what this server and model report";
/** A floor guess, not a report — the history fit still runs against it, so the user is told to correct it. */
const ASSUMED_SOURCE = "assumed, because the server doesn't report it. Override it with your server's real value.";
const UNSTATED_SOURCE = "nobody has stated it, so it counts as no. Override it if your server supports it.";
const ASSUMED_SUFFIX = " (assumed)";

const GENERATION_LEAVES: readonly FactLeaf[] = [
  {
    path: "generation.context.window",
    name: "context window",
    edit: { kind: "number" },
    format: tokens,
    estimatedBy: "generation.context.windowEstimated",
  },
  {
    path: "generation.output.maxTokens.max",
    name: "max output",
    edit: { kind: "number" },
    format: tokens,
    estimatedBy: "generation.output.maxTokensEstimated",
  },
  { path: "generation.input", name: "takes", edit: { kind: "list" } },
  { path: "generation.output.modalities", name: "gives back", edit: { kind: "list" } },
  { path: "generation.reasoning.enabled", name: "thinking", edit: { kind: "boolean" } },
  { path: "generation.reasoning.mode", name: "thinking dial", edit: { kind: "enum", options: REASONING_MODES } },
  { path: "generation.output.structured", name: "structured output", edit: { kind: "boolean" }, unset: NOT_STATED },
  // `tools` present means "accepts tools[]", and `parallel` is its one required field, so declaring this leaf
  // is declaring tool calls. Both answers are a yes; the absence is the no.
  {
    path: "generation.tools.parallel",
    name: "tool calls",
    edit: { kind: "boolean", labels: { yes: "yes, several at once", no: "yes, one at a time" } },
    unset: NOT_STATED,
  },
];

const EMBEDDING_LEAVES: readonly FactLeaf[] = [
  {
    path: "embedding.dims",
    name: "vector width",
    edit: { kind: "number" },
    format: (value): string => `${String(value)} numbers`,
    estimatedBy: "embedding.dimsEstimated",
  },
  { path: "embedding.mrl", name: "truncatable", edit: { kind: "boolean" } },
  { path: "embedding.maxInputTokens", name: "max input", edit: { kind: "number" }, format: tokens, estimatedBy: "embedding.windowEstimated" },
  { path: "embedding.input", name: "takes", edit: { kind: "list" } },
];

const RERANK_LEAVES: readonly FactLeaf[] = [
  { path: "rerank.maxInputTokens", name: "max input", edit: { kind: "number" }, format: tokens, estimatedBy: "rerank.windowEstimated" },
  { path: "rerank.input", name: "takes", edit: { kind: "list" } },
];

// An if-chain with a BARE tail, the `capability/reads.ts::missingClauses` idiom: biome cannot narrow a
// cross-module discriminated union inside a switch. Exhaustiveness stays compile-time — a fourth kind widens
// the tail and `.rerank` stops existing on it.
function leavesOf(capability: Capability): readonly FactLeaf[] {
  if (capability.kind === "generation") {
    return GENERATION_LEAVES;
  }
  if (capability.kind === "embedding") {
    return EMBEDDING_LEAVES;
  }
  return RERANK_LEAVES;
}

/** An overridden row restates the baseline's value — "not stated" when the baseline lacks the leaf — and
 *  says only "your override" when no baseline was handed in. */
function overriddenCapabilitySource(leaf: FactLeaf, baseline: Capability | undefined): string {
  if (baseline === undefined) {
    return "your override";
  }
  const prior = readPath(baseline, leaf.path);
  return `your override — it was ${prior === undefined ? NOT_STATED : formatLeaf(leaf, prior)}`;
}

/** One stated leaf's row. A declared value is never a floor guess, so only an un-overridden row can read assumed. */
function statedCapabilityRow(
  leaf: FactLeaf,
  value: unknown,
  {
    capability,
    declared,
    baseline,
  }: { readonly capability: Capability; readonly declared: DeclaredCapability | null; readonly baseline: Capability | undefined },
): FactRow {
  const overridden = readPath(declared, leaf.path) !== undefined;
  const estimated = !overridden && leaf.estimatedBy !== undefined && readPath(capability, leaf.estimatedBy) === true;
  let source = CAPABILITY_SOURCE;
  if (overridden) {
    source = overriddenCapabilitySource(leaf, baseline);
  } else if (estimated) {
    source = ASSUMED_SOURCE;
  }
  return {
    path: leaf.path,
    name: leaf.name,
    value: estimated ? `${formatLeaf(leaf, value)}${ASSUMED_SUFFIX}` : formatLeaf(leaf, value),
    source,
    overridden,
    edit: leaf.edit,
    draft: draftOf(leaf.edit, value),
    siblings: siblingsFor(leaf.path, capability),
  };
}

/** The one leaf whose schema sibling is REQUIRED: `output.maxTokens` is a `rangeSchema`, so a write naming
 *  only `max` would not parse. The sibling rides from the RESOLVED value, which is what the user is
 *  declaring around. */
const MAX_TOKENS_PATH = "generation.output.maxTokens.max";
const MAX_TOKENS_MIN_PATH = "generation.output.maxTokens.min";

function siblingsFor(path: string, capability: Capability): Readonly<Record<string, unknown>> {
  if (path !== MAX_TOKENS_PATH) {
    return {};
  }
  const min = readPath(capability, MAX_TOKENS_MIN_PATH);
  return min === undefined ? {} : { [MAX_TOKENS_MIN_PATH]: min };
}

/**
 * "What this server accepts" — the same row grammar as the quirks, over the FOLDED capability.
 *
 * `baseline` is the same synthesis computed WITHOUT the row's `declared`: with it, every overridden row
 * restates the value it replaced, exactly as the quirks do; without it the source line says "your override"
 * with no invented prior. A declarable leaf the fold leaves unstated renders as {@link NOT_STATED}.
 */
export function capabilityFactRows(capability: Capability, declared: DeclaredCapability | null, baseline?: Capability): readonly FactRow[] {
  const rows: FactRow[] = [];
  for (const leaf of leavesOf(capability)) {
    const value = readPath(capability, leaf.path);
    if (value === undefined) {
      if (leaf.unset !== undefined) {
        rows.push(unsetRow(leaf.path, leaf, leaf.unset, UNSTATED_SOURCE));
      }
      continue;
    }
    rows.push(statedCapabilityRow(leaf, value, { capability, declared, baseline }));
  }
  return rows;
}
