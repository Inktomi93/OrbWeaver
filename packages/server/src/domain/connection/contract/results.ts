// domain/connection/contract/results — verb result shapes. `CatalogSnapshot` is the get/refresh result;
// its entries are `ModelCatalogEntry` (the cross-boundary entry, @orb/contracts/connection). The schema is
// the TIGHTENED read-seam parse: neo's blind `value as ModelCatalogSnapshot`
// after a `.loose()` parse is REPLACED by an explicit `z.object` whose inferred type IS `CatalogSnapshot`,
// so a new required field is a compile error at the producer, not a silent pass.

import type { ModelCapability } from "@orb/contracts/connection";
import { agentSdkModelSchema, modelCatalogEntrySchema } from "@orb/contracts/connection";
import { z } from "zod";

/** The persisted OR catalog snapshot (`settings['openrouter-model-catalog']`). `fetchedAt` is the epoch-ms
 *  the fetch ran (the TTL is measured from it). The schema mirrors the shape EXACTLY (no `.loose()` blind
 *  cast) so the read-seam parse is honest. */
export const catalogSnapshotSchema = z.object({
  fetchedAt: z.number(),
  models: z.array(modelCatalogEntrySchema),
});

/** The get/refresh result — the snapshot connection holds. Inferred from the schema (one home, no drift). */
export type CatalogSnapshot = z.infer<typeof catalogSnapshotSchema>;

/** The persisted agent-sdk model-catalog snapshot (`settings['agent-sdk-model-catalog']`) — the daemon's
 *  live family→version map. SEPARATE from {@link catalogSnapshotSchema} (OR ≠ agent-sdk, like OR ≠ vLLM):
 *  distinct KV key, distinct TTL cache, never co-mingled. Same honest read-seam parse (no blind cast). */
export const agentSdkCatalogSnapshotSchema = z.object({
  fetchedAt: z.number(),
  models: z.array(agentSdkModelSchema),
});

/** The get/refresh result for the agent-sdk catalog. Inferred from the schema (one home, no drift). */
export type AgentSdkCatalogSnapshot = z.infer<typeof agentSdkCatalogSnapshotSchema>;

/** The daemon-alias resolution (`resolve-agent-sdk-alias`): the CURRENT wire id the daemon maps a bare
 *  family alias / stale id onto, plus the `ModelCapability` derived from the daemon's flags. Not a Zod
 *  schema — `ModelCapability` is a cross-boundary contract type, composed here (never re-parsed). */
export interface AgentSdkAliasResolution {
  /** The daemon's canonical wire id for the requested alias (`sonnet` → `claude-sonnet-5`). */
  readonly resolvedModel: string;
  readonly capability: ModelCapability;
}

/** The three OR slugs a mode-2 (OR-Anthropic skin) spawn maps its tier aliases to — the value
 *  `deriveOrSkinTierModels` produces from the two live catalogs, consumed by the agent-sdk env firewall's
 *  `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` envs (which the bundled CLI needs because it can't take a
 *  slash-containing id as `options.model`). Composed here (the infra request contract declares an identical
 *  structural shape it receives across the tier boundary — infra imports no domain type). */
export interface OrSkinTierModels {
  readonly opus: string;
  readonly sonnet: string;
  readonly haiku: string;
}
