// `capabilityOverrideSchema` — THE ONE shape for every capability statement that is not synthesized: a
// curated JSON row (`capability/sources/curated/*.json`), a connection's `declared` block, a plugin's
// `capabilities: [...]` manifest entry. Three scopes, one parser, one panel. Every field is PARTIAL: a
// higher evidence tier overrides only what it states (§6.2).
//
// `match` exists because two live curated cells are functions of (id × wire-shape), not of id alone —
// `anthropicPrefill` is false on the CLI transport, `midConversationSystem` true ONLY there — so a model row
// may repeat per (wire, api) arm. A connection's `declared` block carries NO `match` (it is that row's).
// `match.model` is a regex SOURCE string; the package's shared row compiler (`capability/sources/rows.ts`, serving
// the curated AND measured tiers) is the ONLY place it is compiled, beside `families.ts` — a prose fence today (no
// gate on the tree spells it).

import { z } from "zod";
import { chatApiSchema } from "../apis.ts";
import { evidenceTierSchema } from "../evidence.ts";
import { endpointFeaturesSchema } from "../features.ts";
import { modelKindSchema } from "../kinds.ts";
import { providerIdSchema } from "../provider-schema.ts";
import { WIRES } from "../wires.ts";
import { embeddingCapabilitySchema } from "./embedding.ts";
import { generationCapabilitySchema } from "./generation.ts";
import { rerankCapabilitySchema } from "./rerank.ts";

export const capabilityMatchSchema = z
  .object({
    /** A regex source over the model id, OR an explicit id list — never both. */
    model: z.string().min(1).optional(),
    ids: z.array(z.string().min(1)).min(1).optional(),
    provider: providerIdSchema.optional(),
    wire: z.enum(WIRES).optional(),
    api: chatApiSchema.optional(),
  })
  .refine((match) => (match.model === undefined) !== (match.ids === undefined), { message: "a match names `model` (a regex) or `ids`, not both" });
export type CapabilityMatch = z.infer<typeof capabilityMatchSchema>;

/** A DATED, CITED provenance line: which tier this row is evidence at, when, and where the reader can look. */
export const capabilityEvidenceSchema = z.object({
  tier: evidenceTierSchema,
  dated: z.string().min(1),
  cite: z.string().min(1),
});

const deepPartialGeneration = generationCapabilitySchema.partial().extend({
  reasoning: generationCapabilitySchema.shape.reasoning.partial().optional(),
  output: generationCapabilitySchema.shape.output.partial().optional(),
  context: generationCapabilitySchema.shape.context.partial().optional(),
  turns: generationCapabilitySchema.shape.turns.unwrap().partial().optional(),
});

export const capabilityOverrideSchema = z.object({
  match: capabilityMatchSchema.optional(),
  kind: modelKindSchema.optional(),
  generation: deepPartialGeneration.optional(),
  embedding: embeddingCapabilitySchema.partial().optional(),
  rerank: rerankCapabilitySchema.partial().optional(),
  features: endpointFeaturesSchema.optional(),
  evidence: capabilityEvidenceSchema.optional(),
});
export type CapabilityOverride = z.infer<typeof capabilityOverrideSchema>;
/** The AUTHORING shape (`z.input`) — what a curated row module `satisfies`, so a typo is a `tsc` error before
 *  the zod parse ever runs. */
export type CapabilityOverrideInput = z.input<typeof capabilityOverrideSchema>;

/** A connection's `declared` block: an override with no `match` (it is that row's) and no `evidence`
 *  (it IS the `declared` tier). */
export const declaredCapabilitySchema = capabilityOverrideSchema.omit({ match: true, evidence: true });
export type DeclaredCapability = z.infer<typeof declaredCapabilitySchema>;
