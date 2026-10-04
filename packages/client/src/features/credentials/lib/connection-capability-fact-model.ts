// "What this server accepts" — the capability half of the connection editor's fact-row grammar
// (`connection-fact-model.ts` owns the grammar and the quirk rows). A capability row cannot be attributed per
// field, so it states the folded value, "assumed" where the fold marks a floor guess, and the baseline it replaced.

import type { Capability, DeclaredCapability } from "@orb/contracts/inference";
import { REASONING_MODES, RERANK_MIN_WINDOW_TOKENS } from "@orb/contracts/inference";
import type { FactChoice, FactLeaf, FactRow } from "./connection-fact-model.ts";
import { draftOf, formatLeaf, grouped, NOT_STATED, readPath, tokens, unsetRow } from "./connection-fact-model.ts";

/** The source line for a capability row this client cannot attribute per field. Deliberately NOT one of the
 *  mock's invented strings — see `connection-fact-model.ts`'s header. */
const CAPABILITY_SOURCE = "what this server and model report";
/** A floor guess, not a report — the history fit still runs against it, so the user is told to correct it. */
const ASSUMED_SOURCE = "assumed, because the server doesn't report it. Override it with your server's real value.";
const UNSTATED_SOURCE = "nobody has stated it, so it counts as no. Override it if your server supports it.";
const ASSUMED_SUFFIX = " (assumed)";
/** The resolver raised a declared number to a floor (a reranker window below its minimum), so the folded value is not
 *  the one the user typed; the row says which one is in effect and why. */
const RAISED_OVERRIDE_SOURCE = (asked: string, floor: string, prior: string): string =>
  `Your override of ${asked} is under the ${floor}-token minimum, so ${floor} is used. It was ${prior}.`;
/** A route whose request sends the window runs the preset's Max context, so that is the window's one home. */
const WINDOW_PATH = "generation.context.window";
const PRESET_WINDOW_SOURCE = (max: string): string => `Set per preset: Max context tokens (up to ${max})`;

function toolsWith(parallel: boolean): (value: unknown) => boolean {
  return (value): boolean => readPath(value, "parallel") === parallel;
}

/** `tools` present means "accepts tools[]" and `parallel` is its one required field, so each yes writes the
 *  whole block. The no writes `null`, the declared absence that beats a server's reported yes (a llama.cpp
 *  server without `--jinja` reports tools it refuses). The first answer seeds an unstated row. */
const TOOL_CALL_CHOICES: readonly FactChoice[] = [
  { label: "yes, one at a time", writes: { parallel: false }, matches: toolsWith(false) },
  { label: "yes, several at once", writes: { parallel: true }, matches: toolsWith(true) },
  { label: "no", writes: null, matches: (value): boolean => value === null || value === undefined },
];

const GENERATION_LEAVES: readonly FactLeaf[] = [
  {
    path: WINDOW_PATH,
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
  // The endpoint posture widens an undescribed row to image + video and marks the guess; a server that states
  // its modalities (D292) clears the mark, so the row reads reported only when something reported it.
  { path: "generation.input", name: "takes", edit: { kind: "list" }, estimatedBy: "generation.modalitiesEstimated" },
  { path: "generation.output.modalities", name: "gives back", edit: { kind: "list" } },
  { path: "generation.reasoning.enabled", name: "thinking", edit: { kind: "boolean" } },
  { path: "generation.reasoning.mode", name: "thinking dial", edit: { kind: "enum", options: REASONING_MODES } },
  { path: "generation.output.structured", name: "structured output", edit: { kind: "boolean" }, unset: NOT_STATED },
  { path: "generation.tools", name: "tool calls", edit: { kind: "choice", choices: TOOL_CALL_CHOICES }, unset: NOT_STATED },
];

/** The vector-width fact's path; the editor returns focus to its row after an embedder-change confirm. */
export const VECTOR_WIDTH_FACT_PATH = "embedding.dims";

const EMBEDDING_LEAVES: readonly FactLeaf[] = [
  {
    path: VECTOR_WIDTH_FACT_PATH,
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
  {
    path: "rerank.maxInputTokens",
    name: "max input",
    // The resolver raises a smaller window to its floor, so a value under it is refused where it is typed.
    edit: { kind: "number", min: { value: RERANK_MIN_WINDOW_TOKENS, reads: tokens(RERANK_MIN_WINDOW_TOKENS) } },
    format: tokens,
    estimatedBy: "rerank.windowEstimated",
  },
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

/** An overridden row restates the baseline's value, "not stated" when the baseline lacks the leaf. When the fold
 *  raised the declared number, the row names both the typed value and the one in effect. */
function overriddenCapabilitySource(leaf: FactLeaf, baseline: Capability, values: { readonly declared: unknown; readonly folded: unknown }): string {
  const prior = readPath(baseline, leaf.path);
  const priorText = prior === undefined ? NOT_STATED : formatLeaf(leaf, prior);
  if (typeof values.declared === "number" && typeof values.folded === "number" && values.folded > values.declared) {
    return RAISED_OVERRIDE_SOURCE(formatLeaf(leaf, values.declared), grouped(values.folded), priorText);
  }
  return `your override — it was ${priorText}`;
}

/** One stated leaf's row. A declared value is never a floor guess, so only an un-overridden row can read assumed. */
function statedCapabilityRow(
  leaf: FactLeaf,
  value: unknown,
  { capability, declared, baseline }: { readonly capability: Capability; readonly declared: DeclaredCapability | null; readonly baseline: Capability },
): FactRow {
  const overridden = readPath(declared, leaf.path) !== undefined;
  // An override already stored keeps its Reset, so the row can be cleared back to the preset's home.
  const settableMax = leaf.path === WINDOW_PATH && capability.kind === "generation" ? capability.generation.context.settable?.max : undefined;
  const setElsewhere = !overridden && settableMax !== undefined;
  const estimated = !(overridden || setElsewhere) && leaf.estimatedBy !== undefined && readPath(capability, leaf.estimatedBy) === true;
  let source = CAPABILITY_SOURCE;
  if (overridden) {
    source = overriddenCapabilitySource(leaf, baseline, { declared: readPath(declared, leaf.path), folded: value });
  } else if (settableMax !== undefined) {
    source = PRESET_WINDOW_SOURCE(grouped(settableMax));
  } else if (estimated) {
    source = ASSUMED_SOURCE;
  }
  return {
    path: leaf.path,
    name: leaf.name,
    value: estimated ? `${formatLeaf(leaf, value)}${ASSUMED_SUFFIX}` : formatLeaf(leaf, value),
    source,
    overridden,
    setElsewhere,
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
 * `baseline` is the same synthesis computed WITHOUT the row's `declared` (`connection.capabilities` always
 * returns it), so every overridden row restates the value it replaced, exactly as the quirks do. A declarable
 * leaf the fold leaves unstated renders as {@link NOT_STATED}.
 */
export function capabilityFactRows(capability: Capability, declared: DeclaredCapability | null, baseline: Capability): readonly FactRow[] {
  const rows: FactRow[] = [];
  for (const leaf of leavesOf(capability)) {
    // A declared `null` (tool calls: no) folds to an absent leaf; the row still states the override.
    const value = readPath(declared, leaf.path) === null ? null : readPath(capability, leaf.path);
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
