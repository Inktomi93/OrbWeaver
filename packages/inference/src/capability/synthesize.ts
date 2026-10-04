// The capability synthesis — ONE fold over the evidence bundle in `EVIDENCE_TIERS` order (§6.2), field-wise,
// then the family floor OR-ed in, then the per-kind floor beneath everything. `declared` WINS over a dated
// measurement WITH a `declared_overrides_measured` warning naming the field: the user's box is the truth
// about the user's box; a shipped measurement describes OUR probe of SOME deployment. Every arm is a PARTIAL
// (only the fields it states); nested objects (`reasoning`, `output`, `context`, `turns`, `tools`) merge one level deep;
// arrays replace — and so does `sampling`: it is the STATED SET of knobs a tier vouches for (§8.7 step 2:
// absent ⇒ not honoured; D68: absence is the fail-closed truth), and a patch grammar cannot express a measured
// ABSENCE. Founding case (inference audit B3, measured 2026-09-20 `gen-1789884252-n94Ebcm1uMVMG1XhxsbB`):
// OpenRouter's catalog ADVERTISES `temperature` for anthropic/claude-opus-5 and strips it upstream, so the
// dated measured `{}` must beat the advertised range — under a one-level merge `{...advertised, ...{}}` never
// could. The same rule makes a connection's `declared.sampling` the WHOLE list it checkboxes.

import type {
  Capability,
  CapabilityOverride,
  DeclaredCapability,
  EmbeddingCapability,
  GenerationCapability,
  ModelKind,
  RerankCapability,
} from "@orb/contracts/inference";
import { EMBEDDING_FLOOR, ESTIMABLE_TURNS, GENERATION_FLOOR, RERANK_FLOOR, RERANK_MIN_WINDOW_TOKENS, TURNS_FLOOR } from "@orb/contracts/inference";
import { assertNever } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { ModelFamily } from "../contract/runtime.ts";
import { applyFamilyFloor } from "./sources/family-floor.ts";

/** What the resolver assembled for one (connection × model), lowest tier last. */
export interface Evidence {
  readonly declared?: DeclaredCapability | null | undefined;
  readonly measured?: readonly CapabilityOverride[] | undefined;
  readonly advertised?: NonNullable<CapabilityOverride["generation"]> | Partial<EmbeddingCapability> | Partial<RerankCapability> | undefined;
  readonly curated?: readonly CapabilityOverride[] | undefined;
}

export interface SynthesizedCapability {
  readonly capability: Capability;
  readonly warnings: readonly ResolvedWarning[];
}

type GenerationPatch = NonNullable<CapabilityOverride["generation"]>;
/** A partial whose stated keys may ALSO be `undefined` — the shape a zod `.partial()` infers under
 *  `exactOptionalPropertyTypes`; `mergeFlat` skips those. */
type Patch<T> = { readonly [K in keyof T]?: T[K] | undefined };

/** The blocks that merge one level deep. `sampling` is deliberately NOT here (a stated set replaces — header).
 *  `tools` is: a catalog that only knows "this model takes tools" must not erase a curated sub-fact about them. */
const NESTED_GENERATION_KEYS = ["reasoning", "output", "context", "turns", "tools"] as const;

function mergeGeneration(base: GenerationCapability, patch: GenerationPatch | Partial<GenerationCapability> | undefined): GenerationCapability {
  if (patch === undefined) {
    return base;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    // A stated absence (`tools: null`, the one nullable leaf of the override schema) removes the block.
    if (value === null) {
      delete merged[key];
      continue;
    }
    if ((NESTED_GENERATION_KEYS as readonly string[]).includes(key) && typeof value === "object" && !Array.isArray(value)) {
      const existing = merged[key];
      merged[key] = { ...(typeof existing === "object" && existing !== null ? existing : {}), ...value };
      continue;
    }
    merged[key] = value;
  }
  // A patch may open `turns` without every required cell: fill from the floor so the shape stays total.
  const turns = merged["turns"];
  if (typeof turns === "object" && turns !== null) {
    merged["turns"] = { ...TURNS_FLOOR, ...turns };
  }
  return merged as GenerationCapability;
}

function mergeFlat<T extends object>(base: T, patch: Patch<T> | undefined): T {
  if (patch === undefined) {
    return base;
  }
  const merged: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as T;
}

/** The fields a `declared` block states that a measured row ALSO states — each is a warning, never silent. */
function declaredOverridesMeasured(declared: object | undefined, measured: readonly object[]): readonly ResolvedWarning[] {
  if (declared === undefined || measured.length === 0) {
    return [];
  }
  const measuredKeys = new Set(measured.flatMap((row) => Object.keys(row)));
  return Object.keys(declared)
    .filter((key) => measuredKeys.has(key))
    .map((field) => ({ code: "declared_overrides_measured", field, message: `declared.${field} overrides a dated measurement on this model` }));
}

function synthesizeGeneration(family: ModelFamily, evidence: Evidence): SynthesizedCapability {
  let capability = GENERATION_FLOOR;
  for (const row of evidence.curated ?? []) {
    capability = mergeGeneration(capability, row.generation);
  }
  capability = mergeGeneration(capability, evidence.advertised as Partial<GenerationCapability> | undefined);
  const measuredRows = (evidence.measured ?? []).map((row) => row.generation).filter((row): row is GenerationPatch => row !== undefined);
  for (const row of measuredRows) {
    capability = mergeGeneration(capability, row);
  }
  const declared = evidence.declared?.generation;
  capability = mergeGeneration(capability, declared);
  // The window is ESTIMATED unless the tier whose window won the fold stated it rather than assumed it: a
  // server's floor for a window it does not state replaces a curated trained maximum but stays a guess.
  const windowSetters = [
    ...(evidence.curated ?? []).map((row) => row.generation?.context),
    (evidence.advertised as GenerationPatch | undefined)?.context,
    ...measuredRows.map((row) => row.context),
    declared?.context,
  ].filter((context) => context?.window !== undefined);
  const windowStated = windowSetters.length > 0 && windowSetters.at(-1)?.windowEstimated !== true;
  capability = { ...capability, context: { ...capability.context, ...(windowStated ? { windowEstimated: undefined } : { windowEstimated: true }) } };
  if (capability.context.windowEstimated === undefined) {
    const { windowEstimated: _dropped, ...rest } = capability.context;
    capability = { ...capability, context: rest };
  }
  // The output cap is ESTIMATED on the same terms: the floor's figure stands only when no tier stated one.
  const capStated =
    [...(evidence.curated ?? []), ...(evidence.measured ?? [])].some((row) => row.generation?.output?.maxTokens !== undefined) ||
    (evidence.advertised as Partial<GenerationCapability> | undefined)?.output?.maxTokens !== undefined ||
    declared?.output?.maxTokens !== undefined;
  const { maxTokensEstimated: _priorCapFlag, ...output } = capability.output;
  capability = { ...capability, output: capStated ? output : { ...output, maxTokensEstimated: true } };
  capability = withTurnsProvenance(capability, [
    ...(evidence.curated ?? []).map((row) => row.generation?.turns),
    (evidence.advertised as GenerationPatch | undefined)?.turns,
    ...measuredRows.map((row) => row.turns),
    declared?.turns,
  ]);
  return {
    capability: { kind: "generation", generation: withDeclaredNoTools(applyFamilyFloor(family, capability), declared) },
    warnings: declaredOverridesMeasured(declared, measuredRows),
  };
}

/** The `turns` cells still on the floor's guess: a cell is STATED when any tier's patch names it (a patch that
 *  opens `turns` is filled from the floor, so the merged block alone cannot tell). */
function withTurnsProvenance(capability: GenerationCapability, patches: readonly (GenerationPatch["turns"] | undefined)[]): GenerationCapability {
  const { turnsEstimated: _prior, ...rest } = capability;
  const estimated = ESTIMABLE_TURNS.filter((cell) => !patches.some((patch) => patch?.[cell] !== undefined));
  return estimated.length === 0 ? rest : { ...rest, turnsEstimated: [...estimated] };
}

/** The family floor ORs tools back in after the fold; a connection that declares its model takes none is the
 *  user's box, so that statement stands over the floor too (§6.2: declared is the top tier). */
function withDeclaredNoTools(capability: GenerationCapability, declared: GenerationPatch | undefined): GenerationCapability {
  if (declared?.tools !== null) {
    return capability;
  }
  const { tools: _dropped, ...rest } = capability;
  return rest;
}

function synthesizeEmbedding(evidence: Evidence): SynthesizedCapability {
  let capability = EMBEDDING_FLOOR;
  for (const row of evidence.curated ?? []) {
    capability = mergeFlat(capability, row.embedding);
  }
  capability = mergeFlat(capability, evidence.advertised as Partial<EmbeddingCapability> | undefined);
  const measuredRows = (evidence.measured ?? []).map((row) => row.embedding).filter((row): row is Patch<EmbeddingCapability> => row !== undefined);
  for (const row of measuredRows) {
    capability = mergeFlat(capability, row);
  }
  const declared = evidence.declared?.embedding;
  capability = mergeFlat(capability, declared);
  const tiers = [...(evidence.curated ?? []), ...(evidence.measured ?? [])];
  const advertised = evidence.advertised as Partial<EmbeddingCapability> | undefined;
  const stated =
    tiers.some((row) => row.embedding?.maxInputTokens !== undefined) || advertised?.maxInputTokens !== undefined || declared?.maxInputTokens !== undefined;
  // The width is ESTIMATED when only the floor stated it — a guessed width must never read as a fit.
  const dimsStated = tiers.some((row) => row.embedding?.dims !== undefined) || advertised?.dims !== undefined || declared?.dims !== undefined;
  const { windowEstimated: _dropped, dimsEstimated: _priorDimsFlag, ...rest } = capability;
  return {
    capability: {
      kind: "embedding",
      embedding: { ...rest, ...(stated ? {} : { windowEstimated: true }), ...(dimsStated ? {} : { dimsEstimated: true }) },
    },
    warnings: declaredOverridesMeasured(declared, measuredRows),
  };
}

function synthesizeRerank(evidence: Evidence): SynthesizedCapability {
  let capability = RERANK_FLOOR;
  for (const row of evidence.curated ?? []) {
    capability = mergeFlat(capability, row.rerank);
  }
  capability = mergeFlat(capability, evidence.advertised as Partial<RerankCapability> | undefined);
  const measuredRows = (evidence.measured ?? []).map((row) => row.rerank).filter((row): row is Patch<RerankCapability> => row !== undefined);
  for (const row of measuredRows) {
    capability = mergeFlat(capability, row);
  }
  const declared = evidence.declared?.rerank;
  capability = mergeFlat(capability, declared);
  const stated =
    [...(evidence.curated ?? []), ...(evidence.measured ?? [])].some((row) => row.rerank?.maxInputTokens !== undefined) ||
    declared?.maxInputTokens !== undefined;
  const { windowEstimated: _dropped, ...merged } = capability;
  const rest = { ...merged, maxInputTokens: Math.max(merged.maxInputTokens, RERANK_MIN_WINDOW_TOKENS) };
  return {
    capability: { kind: "rerank", rerank: stated ? rest : { ...rest, windowEstimated: true } },
    warnings: declaredOverridesMeasured(declared, measuredRows),
  };
}

export function synthesizeCapability(kind: ModelKind, family: ModelFamily, evidence: Evidence): SynthesizedCapability {
  switch (kind) {
    case "generation":
      return synthesizeGeneration(family, evidence);
    case "embedding":
      return synthesizeEmbedding(evidence);
    case "rerank":
      return synthesizeRerank(evidence);
    default:
      return assertNever(kind, "synthesizeCapability");
  }
}
