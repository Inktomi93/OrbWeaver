// `createInferenceRuntime(deps)` — THE ONE runtime surface (§3.3). `domain/connection` and the composition
// root call these and nothing deeper: resolve · availability · the executor · capabilities · the funnel ·
// `roleClientsFor` · catalogs · diagnostics · providers. Backends, credentials and the mirrors never leave
// this file (§12 resolve-time enforcement). Construction is async because the provider registry reads the
// runtime rows once at boot; every later read is in-memory.

import type { Principal } from "@orb/contracts/identity";
import type {
  AgentSdkModel,
  CachePolicyContext,
  Capability,
  EmbeddingCapability,
  GenerationCapability,
  ModelCatalogEntry,
  ModelInfoApi,
  ModelKind,
  ModelListing,
  ProviderAvailability,
  ProviderDef,
  SendAvailability,
  Task,
  TokenizeResult,
  UserConnection,
} from "@orb/contracts/inference";
import { agentSdkModelSchema, connectionTasks, modelCatalogEntrySchema } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import type { UserId } from "@orb/kit/ids";
import { z } from "zod";
import { fetchAnthropicModels } from "./backends/anthropic-messages/index.ts";
import { cachePolicyContextOf, responseReplaySupportedFor } from "./backends/kit/response-cache.ts";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "./backends/kit/sanitize.ts";
import type { LocalLightBackend } from "./backends/local-light/index.ts";
import { tokenTargetOf } from "./backends/openai-compat/tokens.ts";
import type { SynthesizedCapability } from "./capability/synthesize.ts";
import { detectServer } from "./catalog/detect.ts";
import type { EndpointFetchArgs } from "./catalog/endpoint.ts";
import { fetchEndpointModels, probeListedModel, sameModelId } from "./catalog/endpoint.ts";
import { fetchGoogleModels } from "./catalog/google.ts";
import { ENDPOINT_CATALOG_PREFIX, endpointCatalogKey, endpointCatalogPrefix, endpointDetectKey } from "./catalog/keys.ts";
import { builtinCatalog, createCatalogListing } from "./catalog/listing.ts";
import type { Mirror, MirrorDeps } from "./catalog/mirror.ts";
import { createMirror } from "./catalog/mirror.ts";
import { fetchOpenRouterCatalog } from "./catalog/openrouter.ts";
import type { ProviderExecutor } from "./contract/backend.ts";
import type { ProviderDiagnostics } from "./contract/diagnostics.ts";
import { ProviderError } from "./contract/errors.ts";
import type { ResolvedChatKnobs, ResolvedEmbedKnobs } from "./contract/resolve.ts";
import type { CatalogDraft, DetectedServer, EndpointModel, MirrorWarm, ProviderOrigin, RoleClientsFor, SpawnIdentity } from "./contract/runtime.ts";
import { detectedServerSchema, endpointModelsSchema } from "./contract/runtime.ts";
import type { InferenceDeps } from "./deps.ts";
import { resolveChat } from "./funnel/resolve-chat.ts";
import type { EmbedOptions } from "./funnel/resolve-embed.ts";
import { resolveEmbed } from "./funnel/resolve-embed.ts";
import { buildBackends } from "./registry/backends.ts";
import type { ProviderRegistry } from "./registry/providers.ts";
import { createProviderRegistry } from "./registry/providers.ts";
import { checkAvailability, loadVerdict } from "./resolve/availability.ts";
import { behaveAs, detectionUrl } from "./resolve/behave-as.ts";
import type { ResolveArgs, ResolveOutcome, ResolverContext } from "./resolve/resolve-task.ts";
import {
  cachedKind,
  connectionNotFoundMessage,
  discoveredKind,
  endpointMirrorTenant,
  modelInfoApiOf,
  modelTasks,
  resolveTask,
  resolveTaskWithBaseline,
} from "./resolve/resolve-task.ts";
import { createProviderDiagnostics } from "./roles/diagnostics.ts";
import { createProviderExecutor } from "./roles/executor.ts";
import { createRoleClientsFor } from "./roles/role-clients.ts";

export { resolveClaudeExecutable } from "./backends/agent-sdk/executable.ts";
export type { AgentToolResult, AgentToolSpec, SessionEntryWriter } from "./backends/agent-sdk/index.ts";
export { createAgentToolServer } from "./backends/agent-sdk/index.ts";
export { cacheDepthCovering, preservesCacheBlockEnds, rowIndexAtCacheDepth } from "./backends/kit/cache-control.ts";
export { providerErrorFromHttp } from "./backends/kit/error-classify.ts";
export { cachePolicyContextOf, responseReplaySupportedFor } from "./backends/kit/response-cache.ts";
export { resolvedScrubSet } from "./backends/kit/sanitize.ts";
export type {
  LocalLightBackend,
  LocalLightModelCache,
  LocalLightModelSlot,
  LocalLightPrefetchHandle,
  LocalLightPrefetchRecord,
  LocalLightPrefetchTarget,
} from "./backends/local-light/index.ts";
export { DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, LOCAL_LIGHT_MODEL_SLOTS } from "./backends/local-light/index.ts";
// The space TAG derivation + the HTTP error classifier are test-visible seams: the embeddings suites derive the
// tag the way compose does, and the transport suites build a classified `ProviderError` the way a runner does.
export { localLightEmbedSpaceTag } from "./backends/local-light/model-cache.ts";
export { curatedKind } from "./capability/sources/curated/loader.ts";
export * from "./contract/index.ts";
export type { ResolvedWarning } from "./contract/resolve.ts";
export { resolvedWarningSchema } from "./contract/resolve.ts";
export type { ProviderOrigin, RoleClientsFor } from "./contract/runtime.ts";
// The one structured-output layer: a caller that must choose between shapes, or ask whether its need fits a
// connection at all, asks the planner every backend sends.
export type { StructuredFit } from "./contract/structured-turn.ts";
export type {
  BindingActor,
  BindingStore,
  ConnectionStore,
  InferenceDeps,
  InferenceLog,
  ProviderSnapshot,
  ProviderStore,
  SnapshotStore,
  SpanFn,
} from "./deps.ts";
export { resolveCachePolicy } from "./funnel/resolve-cache.ts";
// `resolveCarryReasoning` is exported BESIDE the whole funnel because the chat engine needs exactly one of
// its answers BEFORE the first wire call: the `conversation` rung materializes prior thinking at the
// history-build seam, which runs upstream of `resolveChat`. One policy home, two readers (§8.8).
export { resolveCarryReasoning, resolveChat } from "./funnel/resolve-chat.ts";
export { resolveSideGenSampling } from "./funnel/resolve-side-gen.ts";
export type { ProviderRegistry } from "./registry/providers.ts";
export type { ResolveArgs, ResolveOutcome } from "./resolve/resolve-task.ts";
export { NoConnectionError } from "./resolve/resolve-task.ts";
// The chat turn's ONE neutral-to-backend projection: a caller hands over a history array and its tools as
// definitions + an execute callback, and never branches on the connection's wire itself.
export { toChatRequest } from "./roles/chat-request.ts";
// The two non-turn chat calls behind neutral inputs: a structured-output call and a forced tool round.
export { carriesForcedToolRound, carriesStructured, forcesToolRound, runStructuredChat, toForcedToolRoundRequest } from "./roles/chat-rounds.ts";
export { unavailableRefusal } from "./roles/role-clients.ts";
export { runStructuredTurn } from "./roles/structured-turn.ts";
export type { StructuredAsk, StructuredPlan, StructuredRefusal } from "./structured/plan.ts";
export { planStructuredFor, structuredFitFor } from "./structured/plan.ts";

const OPENROUTER_CATALOG_KEY = "catalog:openrouter";
const AGENT_SDK_CATALOG_KEY = "catalog:agent-sdk";

export interface CapabilityRead extends SynthesizedCapability {
  readonly cacheContext: CachePolicyContext;
  /** The same evidence fold with this row's declaration omitted. */
  readonly baseline: Capability;
  /** The tasks this row may serve (`connectionTasks`), so the pane's requirement badges and the Model-roles
   *  slots read one object. */
  readonly tasks: readonly Task[];
  /** The built-in row a detecting row's server identified as (`features.detectServer`); absent when the row
   *  reads as itself. The editor names it and lists that row's quirks. */
  readonly detectedProviderId?: ProviderDef["id"] | undefined;
}

export interface InferenceRuntime {
  readonly resolve: (args: ResolveArgs) => Promise<ResolveOutcome>;
  readonly availability: (args: ResolveArgs) => Promise<SendAvailability>;
  /** The availability verdict's no-I/O half for a row that already resolved: a local-light model whose latest
   *  load failed reads `model-load-failed`. The Connections readout asks it without probing endpoints. */
  readonly loadVerdict: (resolved: ResolveOutcome["resolved"]) => SendAvailability;
  /** The kind a saved row's model is, as the resolver reads it: the row's declaration, its server's or catalog's
   *  stated kind (warmed first), the curated rows, else `generation`. `cachedFacts` reads only the facts already held,
   *  in memory or persisted, and dials nothing, for a read that lists rows or previews a change. `coldAs` is the kind
   *  such a read answers while a warm could still change it (anything short of the row's own declaration): a preview
   *  that must err toward the change that asks the user first. */
  readonly modelKind: (
    connection: UserConnection,
    options?: { readonly cachedFacts?: boolean | undefined; readonly coldAs?: ModelKind | undefined },
  ) => Promise<ModelKind>;
  /** Tasks whose actual capability requirements this model meets; cached reads never open credentials or dial. */
  readonly modelTasks: (connection: UserConnection, options?: Parameters<InferenceRuntime["modelKind"]>[1]) => Promise<readonly Task[]>;
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
    /** What a provider can list, for a connection being authored or a saved row read through the same draft
     *  (`catalog/listing.ts` owns the strategy arms). A failed or empty list is `listed: false` with its reason —
     *  the pane's typed-id fallback (§7.4); a credential the caller does not hold is a thrown refusal. */
    readonly models: (draft: CatalogDraft) => Promise<ModelListing>;
    /** A `builtin` provider's closed model set (the curated rows), or `null` for a `url` provider, whose list
     *  can lag the provider and so admits a typed id. The write seam refuses an id outside a closed set. */
    readonly builtin: (providerId: string, viewer: UserId) => readonly ModelCatalogEntry[] | null;
    /** Force a live re-fetch of a provider's mirror (the OpenRouter enrichment; the daemon catalog needs a
     *  connection and refreshes on its next `models` read after `invalidate`). Returns the mirror's entry
     *  count when one was warmed, `null` when the strategy has no process-wide mirror. An operator path with
     *  no principal, so it reaches deployment-wide rows only — never a plugin row. */
    readonly refresh: (providerId: string) => Promise<{ readonly models: number | null }>;
    /** Forget what one connection's server last advertised, in memory and in the persisted snapshot, so its
     *  next resolve dials the server again — the hook a save or an endpoint inspection runs, because a server
     *  restarted without its projector or `--jinja` keeps its earlier facts until something asks again. */
    readonly invalidateEndpoint: (connection: UserConnection) => Promise<void>;
    /** What each word tokenizes to on a resolved connection's server, through the same cache a turn reads (the
     *  logit-bias editor's live display). A row with no tokenize endpoint answers `available: false`, no words. */
    readonly tokenize: (resolved: ResolveOutcome["resolved"], words: readonly string[]) => Promise<TokenizeResult>;
  };
  readonly diagnostics: ProviderDiagnostics;
  readonly providers: {
    readonly registry: ProviderRegistry;
    /** What the picker may offer `principal` — every row it may use with its wire's build state (§5.3a:
     *  `claude-sub` renders disabled with `runtime-missing`). A row on an unbuilt wire is LISTED, never hidden;
     *  a plugin row none of the principal's enabled installs contributes is absent (D147). */
    readonly available: (principal: Principal) => readonly ProviderAvailability[];
    readonly register: (row: unknown, origin: ProviderOrigin) => Promise<ProviderDef>;
    readonly drop: (id: ProviderDef["id"]) => Promise<void>;
    readonly registerPlugin: ProviderRegistry["registerPlugin"];
    readonly dropPlugin: ProviderRegistry["dropPlugin"];
  };
  /** The in-process tier's handles for the composition root: the boot prefetch (`start` with the slots that
   *  ACTUALLY resolved, §8.3), the active embed-space tag, and the
   *  bounded close of its inference worker that shutdown runs. */
  readonly localLight: Pick<LocalLightBackend, "prefetch" | "embedSpace" | "close">;
}

/** The kind a row whose model no evidence describes is read as. */
const DEFAULT_MODEL_KIND: ModelKind = "generation";

function requireProvider(provider: ProviderDef | undefined, providerId: string): ProviderDef {
  if (provider === undefined) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${providerId}" is not registered` });
  }
  return provider;
}

/** The ONE refusal an id-taking runtime read answers with when the row is not the caller's — whether it is a
 *  STRANGER'S row or NO row at all. The two answers are deliberately identical, kind AND text (the text comes
 *  from the resolver's shared {@link connectionNotFoundMessage}, whose header states the rule): two
 *  distinguishable refusals are an existence oracle for any id a caller can type, and a kind-only collapse
 *  would not be enough, because `invalid` is the one arm the transport lets carry its OWN message to the
 *  caller. The domain door pre-gates every id-taking verb with the same refusal
 *  (`domain/connection/contract/errors.ts::ConnectionNotFoundError`); this belt is the defense-in-depth copy
 *  behind it and must never answer more precisely than the door it backs. NO `securityEvent` here, unlike the
 *  resolver's owner fence: that one records a BINDING naming a stranger's row, a domain bug no caller can
 *  provoke, while this id arrives FROM the caller — recording it would let an authenticated stranger fill the
 *  security log by typing ids. */
function connectionNotFound(connectionId: UserConnection["id"]): ProviderError {
  return new ProviderError({ kind: "invalid", retryable: false, message: connectionNotFoundMessage(connectionId) });
}

function requireOwned(connection: UserConnection, principal: Principal): void {
  if (connection.ownerId !== principal.userId) {
    throw connectionNotFound(connection.id);
  }
}

export async function createInferenceRuntime(deps: InferenceDeps): Promise<InferenceRuntime> {
  const registry = await createProviderRegistry(deps.providerStore);
  const built = buildBackends(deps);
  const fetchImpl = deps.sdkFetch;
  // `warn` is WRAPPED, never passed as a bare method reference (#2510, found while verifying that lane's e2e).
  // pino's level methods read `this[writeSym]`, so a detached `deps.log.warn` throws
  // `TypeError: this[writeSym] is not a function` the first time it is CALLED — which is only ever on the
  // mirror's degrade path (`catalog/mirror.ts` warmOnce's catch). A catalog warm that failed for an ordinary
  // reason therefore did not degrade to the marked-estimated fallback: it threw from inside its own catch and
  // surfaced as an unmapped 500 on `chat.commitMessage` / `chat.previewAssembly`. The sibling wiring at
  // `backends/agent-sdk/log.ts:93` already wraps for the same reason.
  const mirrorDeps: MirrorDeps = {
    now: deps.now,
    snapshotStore: deps.snapshotStore,
    addSpanEvent: deps.addSpanEvent,
    warn: (fields, message) => {
      deps.log.warn(fields, message);
    },
  };

  const openRouterCatalog = createMirror<ModelCatalogEntry[]>({ key: OPENROUTER_CATALOG_KEY, schema: z.array(modelCatalogEntrySchema), deps: mirrorDeps });
  const agentSdkCatalog = createMirror<AgentSdkModel[]>({ key: AGENT_SDK_CATALOG_KEY, schema: z.array(agentSdkModelSchema), deps: mirrorDeps });
  const endpointMirrors = new Map<string, { readonly baseUrl: string; readonly mirror: Mirror<EndpointModel[]> }>();
  const endpointModels = (baseUrl: string, modelInfoApi: ModelInfoApi | undefined, tenant: string | null): Mirror<EndpointModel[]> => {
    const key = endpointCatalogKey(baseUrl, modelInfoApi, tenant);
    const existing = endpointMirrors.get(key);
    if (existing !== undefined) {
      return existing.mirror;
    }
    const mirror = createMirror<EndpointModel[]>({ key, schema: endpointModelsSchema, deps: mirrorDeps });
    endpointMirrors.set(key, { baseUrl, mirror });
    return mirror;
  };
  const detectMirrors = new Map<string, Mirror<DetectedServer>>();
  const detectedServer = (baseUrl: string): Mirror<DetectedServer> => {
    const existing = detectMirrors.get(baseUrl);
    if (existing !== undefined) {
      return existing;
    }
    const mirror = createMirror<DetectedServer>({ key: endpointDetectKey(baseUrl), schema: detectedServerSchema, deps: mirrorDeps });
    detectMirrors.set(baseUrl, mirror);
    return mirror;
  };

  /** Every reader's mirror on one URL (or every endpoint mirror), and its detect answer, in memory AND in the
   *  store: a mirror that only forgot its cache would read the persisted row back on the next restart. */
  const invalidateEndpointMirrors = async (baseUrl: string | undefined): Promise<void> => {
    for (const entry of endpointMirrors.values()) {
      if (baseUrl === undefined || entry.baseUrl === baseUrl) {
        entry.mirror.invalidate();
      }
    }
    for (const [url, mirror] of detectMirrors) {
      if (baseUrl === undefined || url === baseUrl) {
        mirror.invalidate();
      }
    }
    await deps.snapshotStore.deletePrefix(baseUrl === undefined ? ENDPOINT_CATALOG_PREFIX : endpointCatalogPrefix(baseUrl));
    await built.openAiCompat.tokens.forget(baseUrl);
  };
  /** ONE connection's (URL × reader) mirror and its URL's detect answer, in memory and in the store; a sibling
   *  reader's facts on the same URL are another row's and stay. The reader is read BEFORE the detect answer is
   *  forgotten, so the mirror of the server it detected is the one dropped. */
  const invalidateEndpoint = async (connection: UserConnection): Promise<void> => {
    const provider = registry.get(connection.providerId, connection.ownerId);
    const baseUrl = provider?.baseUrl ?? connection.baseUrl;
    if (provider === undefined || baseUrl === null) {
      return;
    }
    const modelInfoApi = modelInfoApiOf({ detectedServer }, provider, connection);
    const tenant = endpointMirrorTenant(connection);
    endpointModels(baseUrl, modelInfoApi, tenant).invalidate();
    await deps.snapshotStore.deletePrefix(endpointCatalogKey(baseUrl, modelInfoApi, tenant));
    const detectUrl = detectionUrl(provider, connection);
    if (detectUrl !== null) {
      detectedServer(detectUrl).invalidate();
      await deps.snapshotStore.deletePrefix(endpointDetectKey(detectUrl));
    }
    // The server may now run another tokenizer (a reloaded model, a new server on the URL).
    await built.openAiCompat.tokens.forget(baseUrl);
  };

  const openRouterBaseUrl = (): string => {
    const row = registry.deploymentRow("openrouter");
    if (row?.baseUrl === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: "the openrouter provider row carries no baseUrl" });
    }
    return row.baseUrl;
  };
  // The OpenRouter catalog is keyless: nothing secret rides the dial, so nothing is scrubbed from its reason.
  const warmOpenRouterCatalog = (): Promise<MirrorWarm<ModelCatalogEntry[]>> =>
    openRouterCatalog.warm(() => fetchOpenRouterCatalog({ fetch: fetchImpl, baseUrl: openRouterBaseUrl() }), NO_PROVIDER_SECRETS);
  const warmOpenRouter = async (): Promise<void> => {
    await warmOpenRouterCatalog();
  };
  // One late probe per listed row: a burst of turns on a newly bound model shares one. Keyed by the row object, so a
  // refreshed list (new rows) never joins, or is overwritten by, a probe that started on the list it replaced.
  const modelProbes = new WeakMap<EndpointModel, Promise<void>>();
  const probeUnprobedModel = (mirror: Mirror<EndpointModel[]>, args: EndpointFetchArgs, model: string): Promise<void> => {
    const row = mirror.get()?.find((candidate) => sameModelId(args.modelInfoApi, candidate.id, model));
    if (row === undefined || row.probed === true) {
      return Promise.resolve();
    }
    const pending = modelProbes.get(row);
    if (pending !== undefined) {
      return pending;
    }
    const run = probeListedModel(args, row)
      .then((probed) => mirror.amend((rows) => rows.map((candidate) => (candidate === row ? probed : candidate))))
      .finally(() => modelProbes.delete(row));
    modelProbes.set(row, run);
    return run;
  };
  const warmEndpoint = async (connection: UserConnection, provider: ProviderDef, secret: string | null): Promise<void> => {
    const baseUrl = provider.baseUrl ?? connection.baseUrl;
    if (baseUrl === null) {
      return;
    }
    const secrets = resolvedScrubSet({ credential: { secret }, transport: connection.transport });
    const modelInfoApi = modelInfoApiOf({ detectedServer }, provider, connection);
    const tenant = endpointMirrorTenant(connection);
    const endpointArgs: EndpointFetchArgs = {
      fetch: fetchImpl,
      baseUrl,
      secret,
      headers: connection.transport?.headers,
      secrets,
      modelInfoApi,
      probeModel: connection.model,
      warn: (message) => {
        deps.log.warn({ providerId: provider.id }, message);
      },
    };
    // The Anthropic list needs its `anthropic-version` header, which only the provider's own lister sends.
    const fetchRows = (): Promise<EndpointModel[]> => {
      if (provider.wire === "google-generative-ai") {
        return fetchGoogleModels({ baseUrl, secret, secrets, label: "Google models" }, fetchImpl);
      }
      if (provider.wire === "anthropic-messages") {
        return fetchAnthropicModels({ baseUrl, secret, secrets, label: "Anthropic models" }, fetchImpl);
      }
      return fetchEndpointModels(endpointArgs);
    };
    const mirror = endpointModels(baseUrl, modelInfoApi, tenant);
    const warm = await mirror.warm(fetchRows, secrets);
    // A list warmed for another model on this server carries none of this model's own probes.
    if (warm.ok && provider.wire === "openai-compat") {
      await probeUnprobedModel(mirror, endpointArgs, connection.model);
    }
  };
  // The daemon runs under the USER's token (`identity.credential`, re-read by id through the credentials door,
  // never hand-minted), and the warm's failure reason is scrubbed of that same token.
  const warmAgentSdkCatalog = (identity: SpawnIdentity): Promise<MirrorWarm<AgentSdkModel[]>> => {
    const agentSdkBackend = built.agentSdk;
    return agentSdkBackend === undefined
      ? Promise.resolve({ ok: false, reason: "The Claude runtime is not installed." })
      : agentSdkCatalog.warm(() => agentSdkBackend.catalog(identity), resolvedScrubSet({ credential: identity.credential, transport: null }));
  };
  const warmAgentSdk = async (identity: SpawnIdentity): Promise<void> => {
    await warmAgentSdkCatalog(identity);
  };
  const warmDetect = async (connection: UserConnection, provider: ProviderDef, secret: string | null): Promise<boolean> => {
    const baseUrl = detectionUrl(provider, connection);
    if (baseUrl === null) {
      return true;
    }
    const secrets = resolvedScrubSet({ credential: { secret }, transport: connection.transport });
    return (await detectedServer(baseUrl).warm(() => detectServer({ fetch: fetchImpl, baseUrl, secret, headers: connection.transport?.headers }), secrets)).ok;
  };

  const ctx: ResolverContext = {
    deps,
    registry,
    openRouterCatalog,
    endpointModels,
    agentSdkCatalog,
    warmOpenRouter,
    warmEndpoint,
    warmAgentSdk,
    detectedServer,
    warmDetect,
  };
  const executor = createProviderExecutor({ registry: built.registry, span: deps.span });
  const diagnostics = createProviderDiagnostics(built.registry);
  const roleClientsFor = createRoleClientsFor({ deps, ctx, executor });
  const probe = built.openAiCompat.reachability.probe;

  const ownedConnection = async (connectionId: UserConnection["id"], principal: Principal): Promise<UserConnection> => {
    const connection = await deps.connections.get(connectionId);
    if (connection === null) {
      throw connectionNotFound(connectionId);
    }
    requireOwned(connection, principal);
    return connection;
  };

  const catalogModels = createCatalogListing({
    registry,
    resolveCredential: deps.resolveCredential,
    fetch: fetchImpl,
    warn: (fields, message) => {
      deps.log.warn(fields, message);
    },
    warmOpenRouter: warmOpenRouterCatalog,
    get warmAgentSdk(): typeof warmAgentSdkCatalog | undefined {
      return built.agentSdk === undefined ? undefined : warmAgentSdkCatalog;
    },
    listModels: diagnostics.listModels,
  });

  return {
    resolve: (args) => resolveTask(ctx, args),
    availability: (args) => checkAvailability(ctx, built.registry, { probe, loadFailed: built.localLight.loadFailed }, args),
    loadVerdict: (resolved) => loadVerdict(built.localLight.loadFailed, resolved),
    modelKind: async (connection, options): Promise<ModelKind> => {
      if (options?.cachedFacts !== true) {
        return (await discoveredKind(ctx, connection)) ?? DEFAULT_MODEL_KIND;
      }
      const { kind, held } = await cachedKind(ctx, connection);
      return (held ? undefined : options.coldAs) ?? kind ?? DEFAULT_MODEL_KIND;
    },
    executor,
    modelTasks: (connection, options) => modelTasks(ctx, connection, options),
    capabilities: {
      for: async ({ connectionId, principal }): Promise<CapabilityRead> => {
        const connection = await ownedConnection(connectionId, principal);
        const provider = requireProvider(registry.get(connection.providerId, connection.ownerId), connection.providerId);
        // The same discovered kind the resolve below reads, so the task it picks is one the row serves.
        const kind = (await discoveredKind(ctx, connection)) ?? DEFAULT_MODEL_KIND;
        const facts = behaveAs(ctx, provider, connection);
        const tasks = connectionTasks(facts, kind);
        const task = tasks[0];
        if (task === undefined) {
          throw new ProviderError({
            kind: "forbidden",
            retryable: false,
            message: `connection "${connection.label}" (${provider.id}, ${kind}) serves no task`,
          });
        }
        const outcome = await resolveTaskWithBaseline(ctx, { task, principal, connectionId });
        const detected = behaveAs(ctx, provider, connection);
        return {
          capability: outcome.resolved.capability,
          cacheContext: cachePolicyContextOf(outcome.resolved, responseReplaySupportedFor(outcome.resolved)),
          baseline: outcome.baseline,
          warnings: outcome.warnings,
          tasks: await modelTasks(ctx, connection, { cachedFacts: true }),
          ...(detected === provider ? {} : { detectedProviderId: detected.id }),
        };
      },
    },
    funnel: {
      chat: resolveChat,
      embed: resolveEmbed,
    },
    roleClientsFor,
    catalogs: {
      models: catalogModels,
      builtin: (providerId, viewer): readonly ModelCatalogEntry[] | null => {
        const provider = requireProvider(registry.get(providerId, viewer), providerId);
        return provider.catalog === "builtin" ? builtinCatalog(provider) : null;
      },
      refresh: async (providerId): Promise<{ readonly models: number | null }> => {
        const provider = requireProvider(registry.deploymentRow(providerId), providerId);
        if (provider.dialect === "openrouter") {
          openRouterCatalog.invalidate();
          await warmOpenRouter();
          return { models: openRouterCatalog.get()?.length ?? null };
        }
        if (provider.wire === "agent-sdk") {
          agentSdkCatalog.invalidate();
          return { models: null };
        }
        // A fixed URL names its mirrors across every reader; an endpoint provider has no fixed URL, so every
        // connection's own mirror is invalidated.
        await invalidateEndpointMirrors(provider.baseUrl);
        return { models: null };
      },
      invalidateEndpoint,
      tokenize: async (resolved, words): Promise<TokenizeResult> => {
        const target = tokenTargetOf(resolved);
        return target === null ? { available: false, words: [] } : { available: true, words: [...(await built.openAiCompat.tokens.lookup(target, words))] };
      },
    },
    diagnostics,
    providers: {
      registry,
      available: (principal): readonly ProviderAvailability[] =>
        registry.list(principal.userId).map((provider) => {
          const skipped = built.skipped.get(provider.wire);
          if (skipped === undefined) {
            return { provider, available: true };
          }
          return { provider, available: false, cause: provider.wire === "agent-sdk" ? "runtime-missing" : "unavailable" };
        }),
      register: registry.register,
      drop: registry.drop,
      registerPlugin: registry.registerPlugin,
      dropPlugin: registry.dropPlugin,
    },
    localLight: {
      prefetch: built.localLight.prefetch,
      embedSpace: built.localLight.embedSpace,
      close: built.localLight.close,
    },
  };
}
