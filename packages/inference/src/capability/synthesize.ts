// The capability synthesis — ONE fold over the evidence bundle in `EVIDENCE_TIERS` order (§6.2), field-wise,
// then the family floor OR-ed in, then the per-kind floor beneath everything. `declared` WINS over a dated
// measurement WITH a `declared_overrides_measured` warning naming the field: the user's box is the truth
// about the user's box; a shipped measurement describes OUR probe of SOME deployment. Every arm is a PARTIAL
// (only the fields it states); nested objects (`reasoning`, `sampling`, `output`, `context`, `turns`) merge
// one level deep; arrays replace.

import type {
  Capability,
  CapabilityOverride,
  DeclaredCapability,
  EmbeddingCapability,
  GenerationCapability,
  ModelKind,
  RerankCapability,
} from "@orb/contracts/inference";
import { EMBEDDING_FLOOR, GENERATION_FLOOR, RERANK_FLOOR, TURNS_FLOOR } from "@orb/contracts/inference";
import { assertNever } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { ModelFamily } from "./families.ts";
import { applyFamilyFloor } from "./sources/family-floor.ts";

/** What the resolver assembled for one (connection × model), lowest tier last. */
export interface Evidence {
  readonly declared?: DeclaredCapability | null | undefined;
  readonly measured?: readonly CapabilityOverride[] | undefined;
  readonly advertised?: Partial<GenerationCapability> | Partial<EmbeddingCapability> | Partial<RerankCapability> | undefined;
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

const NESTED_GENERATION_KEYS = ["reasoning", "sampling", "output", "context", "turns"] as const;

function mergeGeneration(base: GenerationCapability, patch: GenerationPatch | Partial<GenerationCapability> | undefined): GenerationCapability {
  if (patch === undefined) {
    return base;
  }
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
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
  // The window is ESTIMATED unless a tier above the floor stated one.
  const windowStated =
    [...(evidence.curated ?? []), ...(evidence.measured ?? [])].some((row) => row.generation?.context?.window !== undefined) ||
    (evidence.advertised as Partial<GenerationCapability> | undefined)?.context?.window !== undefined ||
    declared?.context?.window !== undefined;
  capability = { ...capability, context: { ...capability.context, ...(windowStated ? { windowEstimated: undefined } : { windowEstimated: true }) } };
  if (capability.context.windowEstimated === undefined) {
    const { windowEstimated: _dropped, ...rest } = capability.context;
    capability = { ...capability, context: rest };
  }
  return { capability: { kind: "generation", generation: applyFamilyFloor(family, capability) }, warnings: declaredOverridesMeasured(declared, measuredRows) };
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
  const stated =
    [...(evidence.curated ?? []), ...(evidence.measured ?? [])].some((row) => row.embedding?.maxInputTokens !== undefined) ||
    declared?.maxInputTokens !== undefined;
  const { windowEstimated: _dropped, ...rest } = capability;
  return {
    capability: { kind: "embedding", embedding: stated ? rest : { ...rest, windowEstimated: true } },
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
  const { windowEstimated: _dropped, ...rest } = capability;
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
