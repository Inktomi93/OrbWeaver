// `createInferenceRuntime(deps)` — THE ONE runtime surface (§3.3). `domain/connection` and the composition
// root call these and nothing deeper: resolve · availability · the executor · capabilities · the funnel ·
// `roleClientsFor` · catalogs · diagnostics · providers. Backends, credentials and the mirrors never leave
// this file (§12 resolve-time enforcement). Construction is async because the provider registry reads the
// runtime rows once at boot; every later read is in-memory.

import type { Principal } from "@orb/contracts/identity";
import type {
  AgentSdkModel,
  EmbeddingCapability,
  GenerationCapability,
  ModelCatalogEntry,
  ProviderAvailability,
  ProviderDef,
  SendAvailability,
  Task,
  UserConnection,
} from "@orb/contracts/inference";
import { agentSdkModelSchema, connectionTasks, modelCatalogEntrySchema, providerIdSchema } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { z } from "zod";
import { resolvedScrubSet } from "./backends/kit/sanitize.ts";
import type { LocalLightBackend } from "./backends/local-light/index.ts";
import { curatedIdsFor, curatedKind } from "./capability/sources/curated/loader.ts";
import type { SynthesizedCapability } from "./capability/synthesize.ts";
import type { EndpointModel } from "./catalog/endpoint.ts";
import { endpointModelsSchema, fetchEndpointModels } from "./catalog/endpoint.ts";
import type { Mirror, MirrorDeps } from "./catalog/mirror.ts";
import { createMirror } from "./catalog/mirror.ts";
import { fetchOpenRouterCatalog } from "./catalog/openrouter.ts";
import type { ProviderExecutor } from "./contract/backend.ts";
import type { ProviderDiagnostics } from "./contract/diagnostics.ts";
import { ProviderError } from "./contract/errors.ts";
import type { ResolvedChatKnobs, ResolvedEmbedKnobs } from "./contract/resolve.ts";
import type { InferenceDeps } from "./deps.ts";
import { resolveChat } from "./funnel/resolve-chat.ts";
import type { EmbedOptions } from "./funnel/resolve-embed.ts";
import { resolveEmbed } from "./funnel/resolve-embed.ts";
import { buildBackends } from "./registry/backends.ts";
import type { ProviderOrigin, ProviderRegistry } from "./registry/providers.ts";
import { createProviderRegistry } from "./registry/providers.ts";
import { checkAvailability } from "./resolve/availability.ts";
import type { ResolveArgs, ResolveOutcome, ResolverContext } from "./resolve/resolve-task.ts";
import { resolveTask } from "./resolve/resolve-task.ts";
import { createProviderDiagnostics } from "./roles/diagnostics.ts";
import { createProviderExecutor } from "./roles/executor.ts";
import type { RoleClientsFor } from "./roles/role-clients.ts";
import { createRoleClientsFor } from "./roles/role-clients.ts";

export { resolveClaudeExecutable } from "./backends/agent-sdk/executable.ts";
export type { AgentToolResult, AgentToolSpec, SessionEntryWriter } from "./backends/agent-sdk/index.ts";
export { createAgentToolServer } from "./backends/agent-sdk/index.ts";
export type {
  LocalLightBackend,
  LocalLightModelCache,
  LocalLightModelSlot,
  LocalLightPrefetchHandle,
  LocalLightPrefetchRecord,
  LocalLightPrefetchTarget,
} from "./backends/local-light/index.ts";
export { DEFAULT_EMBED_MODEL, DEFAULT_MATTE_MODEL, DEFAULT_RERANK_MODEL, LOCAL_LIGHT_MODEL_SLOTS } from "./backends/local-light/index.ts";
// The space TAG derivation + the HTTP error classifier are test-visible seams: the embeddings suites derive the
// tag the way compose does, and the transport suites build a classified `ProviderError` the way a runner does.
export { localLightEmbedSpaceTag } from "./backends/local-light/model-cache.ts";
export { providerErrorFromHttp } from "./backends/kit/error-classify.ts";
export { curatedKind } from "./capability/sources/curated/loader.ts";
export * from "./contract/index.ts";
export type { ResolvedWarning } from "./contract/resolve.ts";
export type { BindingActor, BindingStore, ConnectionStore, InferenceDeps, InferenceLog, ProviderStore, SnapshotStore, SpanFn } from "./deps.ts";
export { resolveChat } from "./funnel/resolve-chat.ts";
export type { ProviderOrigin, ProviderRegistry } from "./registry/providers.ts";
export type { ResolveArgs, ResolveOutcome } from "./resolve/resolve-task.ts";
export { NoConnectionError } from "./resolve/resolve-task.ts";
export type { RoleClientsFor } from "./roles/role-clients.ts";

const OPENROUTER_CATALOG_KEY = "catalog:openrouter";
const AGENT_SDK_CATALOG_KEY = "catalog:agent-sdk";
const endpointCatalogKey = (baseUrl: string): string => `catalog:endpoint:${baseUrl}`;

export interface CapabilityRead extends SynthesizedCapability {
  /** The tasks this row may serve (`connectionTasks`), so the pane's requirement badges and the Model-roles
   *  slots read one object. */
  readonly tasks: readonly Task[];
}

export interface InferenceRuntime {
  readonly resolve: (args: ResolveArgs) => Promise<ResolveOutcome>;
  readonly availability: (args: ResolveArgs) => Promise<SendAvailability>;
  readonly executor: ProviderExecutor;
  readonly capabilities: {
    /** provider row + declared overrides + catalog row → one descriptor, for a connection the principal owns
     *  (the credential is resolved so an endpoint's own `/v1/models` window can be read). */
    readonly for: (args: { readonly connectionId: UserConnection["id"]; readonly principal: Principal }) => Promise<CapabilityRead>;
  };
  readonly funnel: {
    readonly chat: (intent: UserIntent, capability: GenerationCapability) => ResolvedChatKnobs;
    readonly embed: (opts: EmbedOptions, capability: EmbeddingCapability) => ResolvedEmbedKnobs;
  };
  readonly roleClientsFor: RoleClientsFor;
  readonly catalogs: {
    /** What a connection's provider can pick — strategy = `PROVIDER.catalog`: `url` reads the provider's
     *  fixed list (OpenRouter's enriched catalog, the daemon's aliases) or the CONNECTION's own `/v1/models`;
     *  `builtin` lists the curated rows. An empty list is the pane's typed-id fallback (§7.4). */
    readonly models: (args: { readonly connection: UserConnection; readonly principal: Principal }) => Promise<readonly ModelCatalogEntry[]>;
    /** The pane's SERVER-SIDE `GET <baseUrl>/v1/models` for an endpoint row being AUTHORED (no row yet): a
     *  saved credential (by id, the caller's) or a raw draft key; the deployment's egress guard judges the dial. */
    readonly endpoint: (args: {
      readonly baseUrl: string;
      readonly ownerId: UserId;
      readonly credentialId?: UserCredentialId | undefined;
      readonly key?: string | undefined;
      readonly headers?: Readonly<Record<string, string>> | undefined;
    }) => Promise<readonly ModelCatalogEntry[]>;
    /** Force a live re-fetch of a provider's mirror (the OpenRouter enrichment; the daemon catalog needs a
     *  connection and refreshes on its next `models` read after `invalidate`). Returns the mirror's entry
     *  count when one was warmed, `null` when the strategy has no process-wide mirror. */
    readonly refresh: (providerId: string) => Promise<{ readonly models: number | null }>;
  };
  readonly diagnostics: ProviderDiagnostics;
  readonly providers: {
    readonly registry: ProviderRegistry;
    /** What the picker may offer — every registry row with its wire's build state (§5.3a: `claude-sub`
     *  renders disabled with `runtime-missing`). Rows a principal cannot use are still LISTED, never hidden. */
    readonly available: (principal: Principal) => readonly ProviderAvailability[];
    readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
    readonly drop: (id: ProviderDef["id"]) => Promise<void>;
  };
  /** The in-process tier's handles for the composition root: the boot prefetch (`start` with the slots that
   *  ACTUALLY resolved, §8.3), the alpha-matte op imagery binds narrowly, and the active embed-space tag. */
  readonly localLight: Pick<LocalLightBackend, "prefetch" | "matte" | "embedSpace">;
}

/** The BYO row a DRAFT endpoint key is resolved under (§7.4 `listEndpointModels`): there is no connection yet, so
 *  no provider id — the draft is judged exactly as a `custom-openai` row would be. */
const CUSTOM_OPENAI_PROVIDER_ID = providerIdSchema.parse("custom-openai");

function catalogEntryOf(id: string, contextLength: number | null): ModelCatalogEntry {
  return {
    id,
    name: id,
    contextLength,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    outputModalities: [],
    supportedParameters: [],
    maxCompletionTokens: null,
    reasoning: null,
  };
}

function builtinCatalog(provider: ProviderDef): readonly ModelCatalogEntry[] {
  return curatedIdsFor(provider.id).map((id) => {
    const kind = curatedKind({ model: id, providerId: provider.id, wire: provider.wire });
    return { ...catalogEntryOf(id, null), ...(kind !== undefined ? { kind } : {}) };
  });
}

function requireProvider(registry: ProviderRegistry, providerId: string): ProviderDef {
  const provider = registry.get(providerId);
  if (provider === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${providerId}" is not registered` });
  }
  return provider;
}

function requireOwned(connection: UserConnection, principal: Principal): void {
  if (connection.ownerId !== principal.userId) {
    throw new ProviderError({ kind: "forbidden", retryable: false, message: `connection ${connection.id} is not the caller's` });
  }
}

export async function createInferenceRuntime(deps: InferenceDeps): Promise<InferenceRuntime> {
  const registry = await createProviderRegistry(deps.providerStore);
  const built = buildBackends(deps);
  const fetchImpl = deps.sdkFetch ?? globalThis.fetch;
  const mirrorDeps: MirrorDeps = { now: deps.now, snapshotStore: deps.snapshotStore, addSpanEvent: deps.addSpanEvent, warn: deps.log.warn };

  const openRouterCatalog = createMirror<ModelCatalogEntry[]>({ key: OPENROUTER_CATALOG_KEY, schema: z.array(modelCatalogEntrySchema), deps: mirrorDeps });
  const agentSdkCatalog = createMirror<AgentSdkModel[]>({ key: AGENT_SDK_CATALOG_KEY, schema: z.array(agentSdkModelSchema), deps: mirrorDeps });
  const endpointMirrors = new Map<string, Mirror<EndpointModel[]>>();
  const endpointModels = (baseUrl: string): Mirror<EndpointModel[]> => {
    const existing = endpointMirrors.get(baseUrl);
    if (existing !== undefined) {
      return existing;
    }
    const created = createMirror<EndpointModel[]>({ key: endpointCatalogKey(baseUrl), schema: endpointModelsSchema, deps: mirrorDeps });
    endpointMirrors.set(baseUrl, created);
    return created;
  };

  const openRouterBaseUrl = (): string => {
    const row = registry.get("openrouter");
    if (row?.baseUrl === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "the openrouter provider row carries no baseUrl" });
    }
    return row.baseUrl;
  };
  const warmOpenRouter = async (): Promise<void> => {
    await openRouterCatalog.warm(() => fetchOpenRouterCatalog({ fetch: fetchImpl, baseUrl: openRouterBaseUrl() }));
  };
  const warmEndpoint = async (connection: UserConnection, provider: ProviderDef, secret: string | null): Promise<void> => {
    const baseUrl = provider.baseUrl ?? connection.baseUrl;
    if (baseUrl === null) {
      return;
    }
    const secrets = resolvedScrubSet({ credential: { secret }, transport: connection.transport });
    await endpointModels(baseUrl).warm(() => fetchEndpointModels({ fetch: fetchImpl, baseUrl, secret, headers: connection.transport?.headers, secrets }));
  };
  // The daemon runs under the USER's token: the secret is re-read by id (never hand-minted — `ResolvedSecret`
  // is branded at the credentials domain) and the spawn identity is the row's owner.
  const warmAgentSdk = async (connection: UserConnection): Promise<void> => {
    const backend = built.agentSdk;
    if (backend === undefined) {
      return;
    }
    await agentSdkCatalog.warm(async () => {
      const credential = await deps.resolveCredential({
        credentialId: connection.credentialId,
        ownerId: connection.ownerId,
        providerId: connection.providerId,
      });
      return await backend.catalog({ ownerId: connection.ownerId, credential });
    });
  };

  const ctx: ResolverContext = { deps, registry, openRouterCatalog, endpointModels, agentSdkCatalog, warmOpenRouter, warmEndpoint, warmAgentSdk };
  const executor = createProviderExecutor({ registry: built.registry, span: deps.span });
  const diagnostics = createProviderDiagnostics(built.registry);
  const roleClientsFor = createRoleClientsFor({ deps, ctx, executor });
  const probe = built.openAiCompat.reachability.probe;

  const ownedConnection = async (connectionId: UserConnection["id"], principal: Principal): Promise<UserConnection> => {
    const connection = await deps.connections.get(connectionId);
    if (connection === null) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: `connection ${connectionId} no longer exists` });
    }
    requireOwned(connection, principal);
    return connection;
  };

  const catalogModels = async (args: { readonly connection: UserConnection; readonly principal: Principal }): Promise<readonly ModelCatalogEntry[]> => {
    const { connection, principal } = args;
    requireOwned(connection, principal);
    const provider = requireProvider(registry, connection.providerId);
    if (provider.catalog === "builtin") {
      return builtinCatalog(provider);
    }
    if (provider.dialect === "openrouter") {
      await warmOpenRouter();
      return openRouterCatalog.get() ?? [];
    }
    const credential = await deps.resolveCredential({ credentialId: connection.credentialId, ownerId: connection.ownerId, providerId: provider.id });
    if (provider.wire === "agent-sdk") {
      await warmAgentSdk(connection);
      return (agentSdkCatalog.get() ?? []).map((row) => ({ ...catalogEntryOf(row.alias, null), name: row.displayName }));
    }
    if (provider.wire === "anthropic-messages") {
      // No mirror: the anthropic backend's `listModels` is a plain authenticated read the pane calls directly.
      const resolved = await resolveTask(ctx, { task: "chat", principal, connectionId: connection.id });
      return (await diagnostics.listModels({ connection: resolved.resolved })).models;
    }
    await warmEndpoint(connection, provider, credential.secret);
    const baseUrl = provider.baseUrl ?? connection.baseUrl;
    return baseUrl === null ? [] : (endpointModels(baseUrl).get() ?? []).map((row) => catalogEntryOf(row.id, row.contextLength));
  };

  return {
    resolve: (args) => resolveTask(ctx, args),
    availability: (args) => checkAvailability(ctx, built.registry, probe, args),
    executor,
    capabilities: {
      for: async ({ connectionId, principal }): Promise<CapabilityRead> => {
        const connection = await ownedConnection(connectionId, principal);
        const provider = requireProvider(registry, connection.providerId);
        const kind = connection.declared?.kind ?? curatedKind({ model: connection.model, providerId: provider.id, wire: provider.wire }) ?? "generation";
        const tasks = connectionTasks(provider, kind);
        const task = tasks[0];
        if (task === undefined) {
          throw new ProviderError({
            kind: "forbidden",
            retryable: false,
            message: `connection "${connection.label}" (${provider.id}, ${kind}) serves no task`,
          });
        }
        const outcome = await resolveTask(ctx, { task, principal, connectionId });
        return { capability: outcome.resolved.capability, warnings: outcome.warnings, tasks };
      },
    },
    funnel: {
      chat: resolveChat,
      embed: (opts, capability) => resolveEmbed(opts, capability, deps.embedSpace.dims),
    },
    roleClientsFor,
    catalogs: {
      models: catalogModels,
      endpoint: async (args): Promise<readonly ModelCatalogEntry[]> => {
        const secret =
          args.key ??
          (args.credentialId === undefined
            ? null
            : (await deps.resolveCredential({ credentialId: args.credentialId, ownerId: args.ownerId, providerId: CUSTOM_OPENAI_PROVIDER_ID })).secret);
        const secrets = resolvedScrubSet({ credential: { secret }, transport: args.headers === undefined ? null : { headers: args.headers } });
        const rows = await fetchEndpointModels({ fetch: fetchImpl, baseUrl: args.baseUrl, secret, headers: args.headers, secrets });
        return rows.map((row) => catalogEntryOf(row.id, row.contextLength));
      },
      refresh: async (providerId): Promise<{ readonly models: number | null }> => {
        const provider = requireProvider(registry, providerId);
        if (provider.dialect === "openrouter") {
          openRouterCatalog.invalidate();
          await warmOpenRouter();
          return { models: openRouterCatalog.get()?.length ?? null };
        }
        if (provider.wire === "agent-sdk") {
          agentSdkCatalog.invalidate();
          return { models: null };
        }
        if (provider.baseUrl !== undefined) {
          endpointMirrors.get(provider.baseUrl)?.invalidate();
          return { models: null };
        }
        // An endpoint provider has no fixed URL: every connection's own mirror on it is invalidated.
        for (const mirror of endpointMirrors.values()) {
          mirror.invalidate();
        }
        return { models: null };
      },
    },
    diagnostics,
    providers: {
      registry,
      available: (): readonly ProviderAvailability[] =>
        registry.list().map((provider) => {
          const skipped = built.skipped.get(provider.wire);
          if (skipped === undefined) {
            return { provider, available: true };
          }
          return { provider, available: false, cause: provider.wire === "agent-sdk" ? "runtime-missing" : "unavailable" };
        }),
      register: registry.register,
      drop: registry.drop,
    },
    localLight: { prefetch: built.localLight.prefetch, matte: built.localLight.matte, embedSpace: built.localLight.embedSpace },
  };
}
