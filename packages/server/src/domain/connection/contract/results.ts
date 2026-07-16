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

// --- The picker facade result (getModelsForSource — CONNECTIONS-BUILD-SPEC §2.1) --------------------
/**
 * One pickable model as the Connections role-slot picker renders it. Domain-INTERNAL (client receives it
 * by tRPC inference, the `CredentialView` pattern — `domain/credentials/contract/views.ts`); it is NOT a
 * cross-boundary `@orb/contracts` shape. Derived per-source in `verbs/get-models-for-source.ts` from
 * snapshots/config/state ONLY (no outbound fetch). `promptPrice` carries the `ModelCatalogEntry` USD/token
 * semantics (contracts/connection — the client formats ×1e6 as $/M); the modalities/parameters arrays are
 * populated for OpenRouter catalog entries only (they feed the Vision/Tools filter chips).
 */
export interface SourceModelEntry {
  /** The persistable model id — what `roleDefaults.<role>.model` stores. */
  readonly id: string;
  /** Display name (OR `name`; agent-sdk `displayName`; else the id). */
  readonly label: string;
  /** Secondary line (e.g. agent-sdk alias resolution `sonnet → claude-sonnet-5`). */
  readonly detail?: string;
  readonly contextLength?: number;
  /** USD PER TOKEN (`ModelCatalogEntry` semantics — the client formats ×1e6 as $/M). */
  readonly promptPrice?: number;
  /** OR entries only — feeds the Vision chip (`inputModalities ∋ "image"`). */
  readonly inputModalities?: readonly string[];
  /** OR entries only — feeds the Tools chip (`supportedParameters ∋ "tools"`). */
  readonly supportedParameters?: readonly string[];
  /** OR entries only — the generateImage picker filters on `outputModalities ∋ "image"` (GAP-3). */
  readonly outputModalities?: readonly string[];
  /** Embed-role vllm/local-light entries — the fixed vector space (VLLM_EMBED_DIM / 1024 builtin). */
  readonly dimensions?: number;
  readonly origin: "catalog" | "curated" | "config" | "builtin";
}

/** The per-source availability state driving the role-slot status dot (CONNECTIONS-BUILD-SPEC §1.7). */
const SOURCE_MODELS_STATES = ["ok", "empty-catalog", "needs-key", "owner-only", "engine-off", "needs-probe"] as const;
type SourceModelsState = (typeof SOURCE_MODELS_STATES)[number];

/**
 * The `getModelsForSource` result — the read-only picker facade payload (CONNECTIONS-BUILD-SPEC §2.1).
 * `defaultModelId` is what the resolver would pick for `(role, this source)` when the slot is UNSET (the
 * ghost/auto-fill value — a ghost-parity test guards it against `resolveRole` drift). `allowsFreeText` is
 * true ONLY for `custom_openai` (the "use \{query\} as typed" affordance).
 */
export interface SourceModelsResult {
  readonly state: SourceModelsState;
  readonly models: readonly SourceModelEntry[];
  /** Snapshot `fetchedAt` (OR / agent-sdk); `null` for config/builtin/custom sources. */
  readonly fetchedAt: number | null;
  readonly defaultModelId: string | null;
  readonly allowsFreeText: boolean;
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
