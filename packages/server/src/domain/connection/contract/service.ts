// domain/connection/contract/service — the typed API surface: ConnectionContext (the DI bundle) +
// ConnectionService. Under the inference program (§3.3) this domain is THE FRONT DOOR over `@orb/inference`:
// resolution EXECUTES in the runtime, and every verb here is either a thin delegation (resolve · availability ·
// capabilities · catalogs · diagnostics · providers) or the writer of this domain's three tables
// (`user_connections`, `connection_bindings`, `provider_rows` — producer-owned, `own-tables-only`). Every
// cross-feature dep arrives as an injected op, wired at the composition root; connection sideways-imports no
// sibling runtime.

import type { VectorScope } from "@orb/contracts/embeddings";
import type { Principal } from "@orb/contracts/identity";
import type {
  ConnectionBinding,
  EmbedTargetRefusal,
  ModelListing,
  ResolvedConnectionView,
  RoutableTask,
  SendAvailability,
  TokenizeResult,
} from "@orb/contracts/inference";
import type { AccountCredits, EndpointInspection, GenerationCost, VerifyAuthResult } from "@orb/contracts/providers";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { BindingStore, ConnectionStore, InferenceRuntime, ProviderRegistry, ProviderStore, ResolveOutcome, SnapshotStore } from "@orb/inference";
import type { AutomationRuleId, ConnectionBindingId, PluginId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import type { AuditEntry } from "#foundation/observability";
import type { ENDPOINT_ADMISSIONS } from "#infra/network";
import type {
  CatalogModelsParams,
  ConnectionDiagnosticParams,
  CreateConnectionParams,
  DraftCatalogModelsParams,
  DropPluginProvidersParams,
  DropProviderParams,
  GenerationCostParams,
  GetBoundConnectionParams,
  GetConnectionParams,
  ListBindingsParams,
  ListConnectionsParams,
  PreviewEmbedSpaceChangeParams,
  ProvidersAvailableParams,
  RefreshCatalogParams,
  RegisterPluginProvidersParams,
  RegisterProviderParams,
  RemoveConnectionParams,
  ResolveChatCapabilityParams,
  ResolveTaskParams,
  SetBindingParams,
  TokenizeWordsParams,
  UpdateConnectionParams,
  UseForEverythingParams,
} from "./params.ts";
import type {
  BindingView,
  CatalogRefreshOutcome,
  ConnectionCapabilityView,
  ConnectionView,
  CredentialHealth,
  EmbedSpaceChangePreview,
  ProviderAvailability,
} from "./results.ts";

/** The F12 admission verdict for an endpoint `baseUrl` at WRITE time (the fetch guard re-judges at connect):
 *  `public` = not a private address, a hostname resolved (one that does not resolve yet is judged at connect); `admitted` = private and on the
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
  /** The tasks this plugin routes through its own grant (`pluginGrantTasks` of its declared capabilities),
   *  or `null` when the plugin is not the caller's or does not exist (collapsed). Bound to the plugin row. */
  readonly pluginGrantTasksOf: (pluginId: PluginId, userId: UserId) => Promise<readonly RoutableTask[] | null>;
  /** The F12 write-time admission read (infra/network, over the published allowlist); a hostname is resolved. */
  readonly endpointAdmission: (baseUrl: string) => Promise<EndpointAdmission>;
  /** The ROW half of a probe (credentials domain): revoke / strike / clear + the throttle window. */
  readonly recordProbeOutcome: (args: {
    readonly principal: Principal;
    readonly credentialId: UserCredentialId;
    readonly result: CredentialHealth;
    readonly localEndpoint: boolean;
  }) => Promise<CredentialHealth>;
  /** The embed-space trigger (§10-4): the caller's embed / imageEmbed space MAY have changed. Syncs the owner's stored
   *  targets against it, awaited by the write: a target that moves queues their rebuild, one that matches does not, and
   *  an encoder that does not make its stated width, or does not answer the probe, moves nothing and is returned for
   *  the write to undo and refuse. */
  readonly syncEmbedTargets: (ownerId: UserId) => Promise<EmbedTargetRefusal | null>;
  /** Would the owner's stored target for `task` move if `via` resolved through `connectionId`? `null` when that row
   *  cannot resolve. The embeddings domain's own move rule, read-only, for the change preview. */
  readonly targetWouldMove: (args: {
    readonly ownerId: UserId;
    readonly task: "embed" | "imageEmbed";
    readonly via: "embed" | "imageEmbed";
    readonly connectionId: UserConnectionId;
  }) => Promise<boolean | null>;
  /** How many vectors the owner has stored per scope (the embeddings domain's count), for the change preview. */
  readonly countOwnedVectors: (ownerId: UserId) => Promise<Readonly<Record<VectorScope, number>>>;
  /** The per-user freshness plane (`connectionsChanged`) — injected, never a sideways reach at the bus
   *  (D38, the house injected-emit pattern — refinery's `RefineryContext` precedent). Every persisting verb
   *  (`create` · `update` · `remove` · `setBinding` · `useForEverything`) calls it with the acting owner AFTER
   *  its durable write commits, which is what makes a second tab/device's Connections pane reconcile at all
   *  (docs/work/0121). Fire-and-forget, `void`-returning and non-throwing by construction. */
  readonly emitUserEvent: EmitUserEvent;
}

/** The connection surface — selection's FRONT DOOR, never execution. Nothing here carries a secret. */
export interface ConnectionService {
  /** Run a target-changing read only after this owner's binding/row probe has landed or been undone. */
  readonly withStableEmbeddingBinding: <T>(ownerId: UserId, read: () => Promise<T>) => Promise<T>;
  // ── delegations to the runtime (the turn path, the composer's pre-send gate, the pane's readouts)
  readonly resolve: (params: ResolveTaskParams) => Promise<ResolveOutcome>;
  readonly availability: (params: ResolveTaskParams) => Promise<SendAvailability>;
  /** The caller's OWN chat connection end-to-end, credential-free (`ResolvedConnectionView`). */
  readonly resolveChatCapability: (params: ResolveChatCapabilityParams) => Promise<ResolvedConnectionView>;
  readonly capabilities: (params: GetConnectionParams) => Promise<ConnectionCapabilityView>;
  /** Each word's tokens on the targeted connection's server, cached per (server, model, word). */
  readonly tokenizeWords: (params: TokenizeWordsParams) => Promise<TokenizeResult>;

  // ── the user's rows
  readonly list: (params: ListConnectionsParams) => Promise<readonly ConnectionView[]>;
  readonly get: (params: GetConnectionParams) => Promise<ConnectionView>;
  readonly create: (params: CreateConnectionParams) => Promise<ConnectionView>;
  readonly update: (params: UpdateConnectionParams) => Promise<ConnectionView>;
  readonly remove: (params: RemoveConnectionParams) => Promise<void>;

  // ── Model roles (`connection_bindings`)
  readonly listBindings: (params: ListBindingsParams) => Promise<readonly BindingView[]>;
  /** One indexed binding read and one owner-scoped row read; no runtime resolution or secret projection. */
  readonly getBoundConnection: (params: GetBoundConnectionParams) => Promise<Pick<ConnectionView, "label" | "providerId" | "providerLabel" | "model"> | null>;
  readonly setBinding: (params: SetBindingParams) => Promise<ConnectionBinding>;
  readonly useForEverything: (params: UseForEverythingParams) => Promise<readonly ConnectionBinding[]>;
  /** Would this pending change move the caller to a new embedding generation, and how much would it rebuild?
   *  Read-only: the pane asks before writing, so the user can confirm an index rebuild. */
  readonly previewEmbedSpaceChange: (params: PreviewEmbedSpaceChangeParams) => Promise<EmbedSpaceChangePreview>;

  // ── catalogs
  readonly catalogModels: (params: CatalogModelsParams) => Promise<ModelListing>;
  readonly draftCatalogModels: (params: DraftCatalogModelsParams) => Promise<ModelListing>;
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
