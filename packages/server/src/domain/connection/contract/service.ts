// domain/connection/contract/service — the typed API surface: ConnectionContext (the DI bundle) +
// ConnectionService. Under the inference program (§3.3) this domain is THE FRONT DOOR over `@orb/inference`:
// resolution EXECUTES in the runtime, and every verb here is either a thin delegation (resolve · availability ·
// capabilities · catalogs · diagnostics · providers) or the writer of this domain's three tables
// (`user_connections`, `connection_bindings`, `provider_rows` — producer-owned, `own-tables-only`). Every
// cross-feature dep arrives as an injected op, wired at the composition root; connection sideways-imports no
// sibling runtime.

import type { Principal } from "@orb/contracts/identity";
import type { ConnectionBinding, ResolvedConnectionView, SendAvailability } from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { Db } from "@orb/db";
import type { BindingStore, ConnectionStore, InferenceRuntime, ProviderRegistry, ProviderStore, ResolveOutcome, SnapshotStore } from "@orb/inference";
import type { AutomationRuleId, ConnectionBindingId, PluginId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { ENDPOINT_ADMISSIONS } from "#infra/network";
import type {
  CatalogModelsParams,
  ConnectionDiagnosticParams,
  CreateConnectionParams,
  DropPluginProvidersParams,
  DropProviderParams,
  GenerationCostParams,
  GetConnectionParams,
  ListBindingsParams,
  ListConnectionsParams,
  ListEndpointModelsParams,
  ProvidersAvailableParams,
  RefreshCatalogParams,
  RegisterPluginProvidersParams,
  RegisterProviderParams,
  RemoveConnectionParams,
  ResolveChatCapabilityParams,
  ResolveTaskParams,
  SetBindingParams,
  UpdateConnectionParams,
  UseForEverythingParams,
} from "./params.ts";
import type {
  BindingView,
  CatalogRefreshOutcome,
  ConnectionCapabilityView,
  ConnectionView,
  CredentialHealth,
  ModelListResult,
  ProviderAvailability,
} from "./results.ts";

/** The F12 admission verdict for an endpoint `baseUrl` at WRITE time (the fetch guard re-judges at connect):
 *  `public` = not a private address (the SSRF guard judges it as any host); `admitted` = private and on the
 *  deployment allowlist; `refused` = private and NOT admitted (the pane's inline "Admit `<host>`" affordance);
 *  `invalid` = not an http(s) URL. */
export type EndpointAdmission = (typeof ENDPOINT_ADMISSIONS)[number];

/** The DI bundle the connection verbs close over (wired at the entry composition root). */
export interface ConnectionContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newConnectionId: () => UserConnectionId;
  readonly newBindingId: () => ConnectionBindingId;
  /** THE runtime (`createInferenceRuntime`) — resolution, catalogs, diagnostics and the registry execute there. */
  readonly runtime: InferenceRuntime;
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  /** Does the caller hold this credential row? Bound to the credentials domain (only it reads its table). */
  readonly credentialOwned: (ownerId: UserId, credentialId: UserCredentialId) => Promise<boolean>;
  /** Is this rule the caller's (its author)? Bound to the automation domain. */
  readonly ruleOwnedBy: (ruleId: AutomationRuleId, userId: UserId) => Promise<boolean>;
  /** Is this plugin the caller's (its installer)? Bound to the plugin domain. */
  readonly pluginOwnedBy: (pluginId: PluginId, userId: UserId) => Promise<boolean>;
  /** The F12 write-time admission read (infra/network, over the published allowlist). */
  readonly endpointAdmission: (baseUrl: string) => EndpointAdmission;
  /** The ROW half of a probe (credentials domain): revoke / strike / clear + the throttle window. */
  readonly recordProbeOutcome: (args: {
    readonly principal: Principal;
    readonly credentialId: UserCredentialId;
    readonly result: CredentialHealth;
    readonly localEndpoint: boolean;
  }) => Promise<CredentialHealth>;
  /** PD-139a re-raised (§10-4): the caller's embed / imageEmbed space MAY have changed — the settings-blob
   *  trigger this replaces enqueued the purge+reindex; the composition root binds the same op here. */
  readonly onEmbedSpaceChanged: (ownerId: UserId) => void;
}

/** The connection surface — selection's FRONT DOOR, never execution. Nothing here carries a secret. */
export interface ConnectionService {
  // ── delegations to the runtime (the turn path, the composer's pre-send gate, the pane's readouts)
  readonly resolve: (params: ResolveTaskParams) => Promise<ResolveOutcome>;
  readonly availability: (params: ResolveTaskParams) => Promise<SendAvailability>;
  /** The caller's OWN chat connection end-to-end, credential-free (`ResolvedConnectionView`). */
  readonly resolveChatCapability: (params: ResolveChatCapabilityParams) => Promise<ResolvedConnectionView>;
  readonly capabilities: (params: GetConnectionParams) => Promise<ConnectionCapabilityView>;

  // ── the user's rows
  readonly list: (params: ListConnectionsParams) => Promise<readonly ConnectionView[]>;
  readonly get: (params: GetConnectionParams) => Promise<ConnectionView>;
  readonly create: (params: CreateConnectionParams) => Promise<ConnectionView>;
  readonly update: (params: UpdateConnectionParams) => Promise<ConnectionView>;
  readonly remove: (params: RemoveConnectionParams) => Promise<void>;

  // ── Model roles (`connection_bindings`)
  readonly listBindings: (params: ListBindingsParams) => Promise<readonly BindingView[]>;
  readonly setBinding: (params: SetBindingParams) => Promise<ConnectionBinding>;
  readonly useForEverything: (params: UseForEverythingParams) => Promise<readonly ConnectionBinding[]>;

  // ── catalogs
  readonly catalogModels: (params: CatalogModelsParams) => Promise<ModelListResult>;
  readonly listEndpointModels: (params: ListEndpointModelsParams) => Promise<ModelListResult>;
  readonly refreshCatalog: (params: RefreshCatalogParams) => Promise<CatalogRefreshOutcome>;

  // ── diagnostics (every one against ONE of the caller's rows)
  readonly probe: (params: ConnectionDiagnosticParams) => Promise<CredentialHealth>;
  readonly accountCredits: (params: ConnectionDiagnosticParams) => Promise<AccountCredits>;
  readonly generationCost: (params: GenerationCostParams) => Promise<GenerationCost>;
  readonly verifyAuth: (params: ConnectionDiagnosticParams) => Promise<VerifyAuthResult>;
  readonly inspectEndpoint: (params: ConnectionDiagnosticParams) => Promise<EndpointInspection>;

  // ── providers (the registry: built-ins ∪ `provider_rows`)
  readonly providersAvailable: (params: ProvidersAvailableParams) => Promise<readonly ProviderAvailability[]>;
  readonly registerProvider: (params: RegisterProviderParams) => Promise<void>;
  readonly dropProvider: (params: DropProviderParams) => Promise<void>;
  readonly registerPluginProviders: (params: RegisterPluginProvidersParams) => Promise<void>;
  readonly dropPluginProviders: (params: DropPluginProvidersParams) => Promise<void>;
  readonly registry: ProviderRegistry;
}

/** The runtime's FOUR persistence ports over this domain's tables (inference program §11) — `@orb/inference`
 *  owns no `@orb/db`, so the composition root hands it these. READ side only; the writes stay in the verbs. */
export interface ConnectionPorts {
  readonly connections: ConnectionStore;
  readonly bindings: BindingStore;
  readonly providerStore: ProviderStore;
  readonly snapshotStore: SnapshotStore;
}

/** What the domain's `WorkloadContribution` factory needs from the composition root (`refresh-model-catalog`). */
export interface ConnectionWorkloadDeps {
  readonly connection: Pick<ConnectionService, "refreshCatalog">;
}
