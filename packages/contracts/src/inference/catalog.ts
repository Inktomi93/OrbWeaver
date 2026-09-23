// The catalog ENTRY shapes — what a provider's model list hands the picker and the synthesis. Moved here
// from `@orb/contracts/connection` (which re-exports them until it is deleted). `ModelCatalogEntry` is the
// OpenRouter-shaped row (the only catalog that carries modalities/pricing/reasoning); an OpenAI-compatible
// `/v1/models` yields ids (+ a window when the server reports one) into the same shape with the rest null;
// `AgentSdkModel` is the daemon's `supportedModels()` row, a SEPARATE snapshot never co-mingled.

import { z } from "zod";
import { effortLevelSchema } from "./capability/generation.ts";
import { modelKindSchema } from "./kinds.ts";

export const modelCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Only OpenRouter's catalog carries a kind; every other `/v1/models` is kindless (§5.7 `kindOf`). */
  kind: modelKindSchema.optional(),
  contextLength: z.number().nullable(),
  /** USD per token (OpenRouter reports as strings — normalized to number here); null when unpriced. */
  promptPrice: z.number().nullable(),
  completionPrice: z.number().nullable(),
  cacheReadPrice: z.number().nullable(),
  cacheWritePrice: z.number().nullable(),
  /** Free strings as the catalog spells them; `parseModalities` folds them into `Modality[]`. */
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()).optional(),
  supportedParameters: z.array(z.string()),
  maxCompletionTokens: z.number().nullable().optional(),
  isModerated: z.boolean().optional(),
  reasoning: z
    .object({
      mandatory: z.boolean(),
      defaultEnabled: z.boolean().optional(),
      supportedEfforts: z.array(z.string()).nullable().optional(),
      defaultEffort: z.string().nullable().optional(),
      supportsMaxTokens: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  /** The catalog id whose MODEL facts this row shares, when the catalog itself says so: a floating alias's named
   *  target, or the base id a variant suffix (`:batch`) shares a canonical slug with. The capability rows match
   *  on it; the row's own advertised fields still describe the row. Absent ⇒ the id is its own model. */
  aliasOf: z.string().optional(),
});
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;

/** One model-list answer for a provider, saved row or draft. `listed: false` carries WHY — a failed dial and
 *  an empty list both land here with their own reason, so a failure never reads as "listed no models". Both
 *  branches are strict: a stray `models` on `listed: false` is a wrong answer, and it is rejected, not stripped. */
export const modelListingSchema = z.discriminatedUnion("listed", [
  z.strictObject({ listed: z.literal(true), models: z.array(modelCatalogEntrySchema) }),
  z.strictObject({ listed: z.literal(false), reason: z.string() }),
]);
export type ModelListing = z.infer<typeof modelListingSchema>;

export const agentSdkModelSchema = z.object({
  /** The alias the daemon accepts (`sonnet`/`opus`/`haiku`, or a version-only id). */
  alias: z.string(),
  /** The canonical wire id `alias` resolves to today; `null` when the daemon omits it. */
  resolvedModel: z.string().nullable(),
  displayName: z.string(),
  description: z.string(),
  supportsEffort: z.boolean(),
  effortLevels: z.array(effortLevelSchema),
  supportsAdaptiveThinking: z.boolean(),
});
export type AgentSdkModel = z.infer<typeof agentSdkModelSchema>;

/** The `refresh-model-catalog` workload's COUNTS-ONLY result: no provider entry shape leaks into the queue's
 *  wire. `null` = that lane failed (distinct from 0 = a real empty catalog). The agent-sdk lane is `null` BY
 *  DESIGN since the cut-over (inference program §4): the daemon catalog is warmed on demand under a USER's
 *  own token — there is no host credential for a scheduled workload to spawn the runtime with. */
export interface CatalogRefreshResult {
  readonly models: number | null;
  readonly agentSdkModels: number | null;
}
