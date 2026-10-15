import type { AgentSdkModel, ModelCatalogEntry, ModelInfoApi, ProviderDef, ResolveTaskParams, UserConnection } from "@orb/contracts/inference";
import type { Mirror } from "./catalog.ts";
import type { ProviderRegistry } from "./registry.ts";
import type { ResolvedWarning } from "./resolve.ts";
import type { Resolved } from "./resolved.ts";
import type { DetectedServer, EndpointModel, InferenceDeps, SpawnIdentity } from "./runtime.ts";

/** The slice of the resolver context detection reads: the per-URL detect cache. */
export interface DetectCache {
  readonly detectedServer: (baseUrl: string) => Mirror<DetectedServer>;
}

export interface ResolveArgs extends ResolveTaskParams {
  readonly signal?: AbortSignal | undefined;
  /** Read only the server facts already held, in memory or in the persisted snapshot, and dial nothing. For a read-only
   *  question asked before the user commits (the change preview): a host that does not answer must not hold it. A fact
   *  never persisted degrades to the stated and curated facts. */
  readonly cachedFacts?: boolean | undefined;
}

/** Everything the resolver reads that is not a dep: the registry + the catalog mirrors + the warms. */
export interface ResolverContext {
  readonly deps: InferenceDeps;
  readonly registry: ProviderRegistry;
  readonly openRouterCatalog: Mirror<ModelCatalogEntry[]>;
  /** The endpoint mirror for one (URL × reader) — a reader's facts never leak into another reader's rows. */
  readonly endpointModels: (baseUrl: string, modelInfoApi: ModelInfoApi | undefined, tenant: string | null) => Mirror<EndpointModel[]>;
  readonly agentSdkCatalog: Mirror<AgentSdkModel[]>;
  readonly warmOpenRouter: () => Promise<void>;
  readonly warmEndpoint: (connection: UserConnection, provider: ProviderDef, secret: string | null) => Promise<void>;
  readonly warmAgentSdk: (identity: SpawnIdentity) => Promise<void>;
  /** The per-URL answer of a detecting row's server probe (`catalog:endpoint:<url>#detect`). */
  readonly detectedServer: (baseUrl: string) => Mirror<DetectedServer>;
  /** Warm the detect answer; `false` when the server could not be reached to ask. */
  readonly warmDetect: (connection: UserConnection, provider: ProviderDef, secret: string | null) => Promise<boolean>;
}

export interface ResolveOutcome {
  readonly resolved: Resolved;
  readonly warnings: readonly ResolvedWarning[];
}
