// The resolver: `(task, principal, actor?, requires?)` → `Resolved<Task>`, in ONE fold, reading only the
// principal's own rows. The steps, in order and each with its refusal named:
//   1. the §7.1 binding fold (no row ⇒ `no-connection`, never a born default — F2/F16);
//   2. the connection row — it must be the FUNDER's (a binding that names a stranger's row is a domain bug,
//      refused and recorded, never served);
//   3. the provider row from the registry, read as the row's owner (a dropped plugin provider, or one none of
//      the owner's enabled installs contributes ⇒ `no-connection`); every FACT below reads `behaveAs`'s row
//      (a detecting row's server), while identity and the credential stay the registered row's;
//   4. the secret (by id, the funder's) and the catalog warm this provider's `catalog` strategy owns, so the kind a
//      server or catalog states is in hand before anything reads it;
//   5. the model's KIND: the row's `declared.kind` → the catalog row → curated → the task's own kind; then
//      `connectionTasks` decides whether this row may serve the task at all;
//   6. api coherence (data), the model id normalised (no heal), then the evidence bundle → synthesis →
//      the endpoint posture floors → the features fold;
//   7. the requirement verdict and `canFund` — VERDICTS on the result, never throws.

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type {
  AgentSdkModel,
  Capability,
  EndpointFeatures,
  ModelCatalogEntry,
  ModelInfoApi,
  ModelKind,
  ProviderDef,
  RequirementVerdict,
  Task,
  UserConnection,
} from "@orb/contracts/inference";
import { canFund, connectionTasks, effectivePromptCache, modelIdSchema, requirementMet, taskDef } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { googleModelId } from "../backends/google/model.ts";
import { resolveEmbedDtype } from "../backends/local-light/model-cache.ts";
import { detectModelFamily } from "../capability/families.ts";
import { applyEndpointPosture, applyServerToolChoice, clampToTrainedWindow } from "../capability/floor.ts";
import { advertisedFromAgentSdk, agentSdkRowFor } from "../capability/sources/advertised/agent-sdk.ts";
import { advertisedFromGoogle } from "../capability/sources/advertised/google.ts";
import { advertisedFromOpenAiCompat, advertisedStatesInput } from "../capability/sources/advertised/openai-compat.ts";
import { advertisedFromOpenRouter } from "../capability/sources/advertised/openrouter.ts";
import { curatedKind, curatedRows } from "../capability/sources/curated/loader.ts";
import { measuredRows } from "../capability/sources/measured/loader.ts";
import type { Evidence } from "../capability/synthesize.ts";
import { synthesizeCapability } from "../capability/synthesize.ts";
import { sameModelId } from "../catalog/endpoint.ts";
import type { Mirror } from "../catalog/mirror.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { DetectedServer, EndpointModel, SpawnIdentity } from "../contract/runtime.ts";
import type { BindingActor, InferenceDeps } from "../deps.ts";
import type { ProviderRegistry } from "../registry/providers.ts";
import { behaveAs, behavedFeatures, detectionUrl } from "./behave-as.ts";
import { resolveApi } from "./coherence.ts";
import { normalizeModelId } from "./heal.ts";
import { foldBindings } from "./precedence.ts";

export interface ResolveArgs {
  readonly task: Task;
  readonly principal: Principal;
  readonly actor?: BindingActor | undefined;
  /** An explicit row instead of the fold — the turn's own already-resolved connection re-read, a pane preview. */
  readonly connectionId?: UserConnection["id"] | undefined;
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

export class NoConnectionError extends ProviderError {
  constructor(message: string) {
    super({ kind: "invalid", retryable: false, message });
    this.name = "NoConnectionError";
  }
}

/** THE ONE refusal TEXT every id-taking belt in this package answers a foreign or absent connection id with —
 *  `connectionFor` below and `requireOwned`/`ownedConnection` in the package root. It is a single literal on
 *  purpose: the two FACTS it stands for ("that row is someone else's" and "there is no such row") must be one
 *  indistinguishable answer, or the pair is an existence oracle for any id a caller can type. The kind is
 *  already collapsed at both belts, but `invalid` is the one arm the transport lets carry its OWN message to
 *  the caller (`transport/trpc/error-mapping.ts`), so the WORDS are half of the answer — and sharing them
 *  across both belts also means a caller cannot tell which belt refused. The distinction survives INWARD, in
 *  the `securityEvent` the owner-mismatch arm records. Same rule, same wording as the domain door this backs:
 *  `domain/connection/contract/errors.ts::ConnectionNotFoundError`. */
export function connectionNotFoundMessage(connectionId: UserConnection["id"]): string {
  return `connection ${connectionId} not found`;
}

/** Which kind this row's model is — never guessed from the task alone when any evidence states one. */
function kindOf(
  ctx: ResolverContext,
  args: { readonly task: Task; readonly provider: ProviderDef; readonly connection: UserConnection; readonly includeDeclared?: boolean },
): ModelKind {
  return statedKind(ctx, args) ?? taskDef(args.task).kind;
}

/** The kind the evidence states: the row's declaration, the provider's catalog (read from the warmed mirror), the
 *  curated rows; `undefined` when none states one. */
function statedKind(
  ctx: ResolverContext,
  args: { readonly provider: ProviderDef; readonly connection: UserConnection; readonly includeDeclared?: boolean | undefined },
): ModelKind | undefined {
  const { provider, connection } = args;
  let catalogKind: ModelKind | undefined;
  if (provider.dialect === "openrouter") {
    catalogKind = ctx.openRouterCatalog.get()?.find((entry) => entry.id === connection.model)?.kind;
  } else if (provider.wire === "google-generative-ai" || provider.wire === "openai-compat") {
    // Native discovery (Google's method list, a local server's model-info API) states a kind the generic list lacks.
    catalogKind = endpointEntryFor(ctx, { provider, connection, model: connection.model })?.kind;
  }
  return (
    (args.includeDeclared === false ? undefined : connection.declared?.kind) ??
    catalogKind ??
    curatedKind({ model: connection.model, providerId: provider.id, wire: provider.wire })
  );
}

/** The advertised tier for one (row × model) read as `kind`: a catalog row describes a chat model and an embedder
 *  differently, so the baseline fold (which may read another kind) asks again. */
function advertisedFor(
  ctx: ResolverContext,
  {
    provider,
    registered,
    connection,
    model,
    kind,
  }: {
    readonly provider: ProviderDef;
    /** The connection's own row, beneath the behaved one in the features fold (its sampler spellings stay). */
    readonly registered: ProviderDef;
    readonly connection: UserConnection;
    readonly model: ModelId;
    readonly kind: ModelKind;
  },
): Evidence["advertised"] {
  if (provider.wire === "agent-sdk") {
    const row = agentSdkRowFor(model, ctx.agentSdkCatalog.get());
    return row === undefined ? undefined : advertisedFromAgentSdk(row);
  }
  if (provider.dialect === "openrouter") {
    const entry = ctx.openRouterCatalog.get()?.find((candidate) => candidate.id === model);
    return entry === undefined ? undefined : advertisedFromOpenRouter(entry);
  }
  const entry = endpointEntryFor(ctx, { provider, connection, model });
  if (provider.wire === "google-generative-ai") {
    return googleAdvertised(entry, provider, model);
  }
  return entry === undefined ? undefined : advertisedFromOpenAiCompat(entry, kind, behavedFeatures(registered, provider, connection));
}

/** The endpoint mirror's row for this connection's model, on the two wires whose list the mirror holds. */
function endpointEntryFor(
  ctx: ResolverContext,
  { provider, connection, model }: { readonly provider: ProviderDef; readonly connection: UserConnection; readonly model: ModelId },
): EndpointModel | undefined {
  const baseUrl = provider.wire === "openai-compat" || provider.wire === "google-generative-ai" ? (provider.baseUrl ?? connection.baseUrl) : null;
  if (baseUrl === null) {
    return;
  }
  const catalogId = provider.wire === "google-generative-ai" ? googleModelId(model) : model;
  const reader = modelInfoApiOf(ctx, provider, connection);
  return ctx
    .endpointModels(baseUrl, reader, endpointMirrorTenant(connection))
    .get()
    ?.find((candidate) => sameModelId(reader, candidate.id, catalogId));
}

/** Whose list a row's endpoint mirror holds. A server that authenticates the caller may answer each credential with a
 *  different model list, so an authenticated row keeps its own mirror, named by the credential row's id (never the
 *  secret) or, for a row that authenticates only through its own headers, by the row. An anonymous server answers
 *  everyone alike, so its rows share one mirror (`null`). */
export function endpointMirrorTenant(connection: UserConnection): string | null {
  if (connection.credentialId !== null) {
    return connection.credentialId;
  }
  return Object.keys(connection.transport?.headers ?? {}).length > 0 ? connection.id : null;
}

/** The reader this row dials beside `/v1/models`: the folded `features.modelInfoApi` (wire ← registered row ←
 *  detected row ← declared), so the models mirror keys on the detected reader. */
export function modelInfoApiOf(ctx: Pick<ResolverContext, "detectedServer">, provider: ProviderDef, connection: UserConnection): ModelInfoApi | undefined {
  return behavedFeatures(provider, behaveAs(ctx, provider, connection), connection).modelInfoApi;
}

function googleAdvertised(entry: EndpointModel | undefined, provider: ProviderDef, model: ModelId): Evidence["advertised"] {
  if (entry === undefined) {
    return;
  }
  if (entry.kind === "embedding") {
    return entry.contextLength === null ? {} : { maxInputTokens: entry.contextLength };
  }
  return advertisedFromGoogle(entry, curatedRows({ model, providerId: provider.id, wire: provider.wire }));
}

/** The id the curated/measured rows and the family detector read: the model itself, or — on OpenRouter — the id
 *  its catalog row says it shares model facts with (a floating alias's target, a `:batch` variant's base). The
 *  advertised tier stays keyed on the connection's own id: it describes that row. */
function factsModelFor(ctx: ResolverContext, provider: ProviderDef, model: ModelId): ModelId {
  if (provider.dialect !== "openrouter") {
    return model;
  }
  const alias = ctx.openRouterCatalog.get()?.find((entry) => entry.id === model)?.aliasOf;
  return alias === undefined ? model : modelIdSchema.parse(alias);
}

async function warmFor(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection, credential: ResolvedSecret): Promise<void> {
  if (provider.catalog === "builtin") {
    return;
  }
  if (provider.wire === "agent-sdk") {
    await ctx.warmAgentSdk({ ownerId: connection.ownerId, credential });
    return;
  }
  if (provider.dialect === "openrouter") {
    await ctx.warmOpenRouter();
    return;
  }
  await ctx.warmEndpoint(connection, provider, credential.secret);
}

export interface ResolveOutcome {
  readonly resolved: Resolved;
  readonly warnings: readonly ResolvedWarning[];
}

async function connectionFor(ctx: ResolverContext, args: ResolveArgs): Promise<UserConnection> {
  const funder = args.principal.userId;
  let connectionId = args.connectionId ?? null;
  if (connectionId === null) {
    const fold = await foldBindings(ctx.deps.bindings, { task: args.task, funder, ...(args.actor !== undefined ? { actor: args.actor } : {}) });
    connectionId = fold.connectionId;
  }
  if (connectionId === null) {
    throw new NoConnectionError(`no connection is bound for "${args.task}"`);
  }
  const connection = await ctx.deps.connections.get(connectionId);
  if (connection === null) {
    throw new NoConnectionError(connectionNotFoundMessage(connectionId));
  }
  if (connection.ownerId !== funder) {
    // A binding may only point at a row its derived owner holds — enforced at the writer verb; reaching here
    // is a domain bug, and serving it would spend a stranger's key. Refuse and record.
    ctx.deps.securityEvent?.("connection_owner_mismatch", { task: args.task, connectionId, funder, owner: connection.ownerId });
    // THE SAME TEXT the missing-row arm above throws, on purpose. `args.connectionId` is caller-supplied, so
    // "this row exists but is not yours" and "no such row" must be one indistinguishable answer or the pair is
    // an existence oracle — the `kind` was already collapsed (both are `NoConnectionError`), but `invalid`
    // carries its OWN message to the caller at the transport, so the message is half of the answer. The
    // distinction survives INWARD in the `securityEvent` above, which is where an operator wants it.
    throw new NoConnectionError(connectionNotFoundMessage(connectionId));
  }
  return connection;
}

/** The one requirement a WIRE adds beyond the capability: rerank on the openai-compat wire is a plain POST
 *  to the row's `features.rerankPath` (no SDK rerank model), so a row without the path — an LM Studio /
 *  Ollama / custom row whose connection never declared one — reads `requirement-unmet`, never a 404 at send.
 *  A verdict on the folded features, which is why it lives here and not on the provider row. */
function withWireRequirement(base: RequirementVerdict, task: Task, provider: ProviderDef, features: EndpointFeatures): RequirementVerdict {
  if (task !== "rerank" || provider.wire !== "openai-compat" || features.rerankPath !== undefined) {
    return base;
  }
  const missing = [...(base.ok ? [] : base.missing), "features.rerankPath"];
  return { ok: false, missing };
}

/** The local-light encoder's deployment dtype is execution truth. An omitted declaration inherits that
 * truth (including a non-default deployment override); an explicit declaration must match or resolution
 * refuses before a writer, reader, or purge can act on a vector-space tag the encoder does not produce. */
function withLocalLightEmbedDtype(
  capability: Capability,
  provider: ProviderDef,
  declaredDtype: string | undefined,
  configuredDtype: string | undefined,
): Capability {
  if (provider.wire !== "local-light" || capability.kind !== "embedding") {
    return capability;
  }
  const servedDtype = resolveEmbedDtype(configuredDtype);
  if (declaredDtype !== undefined && declaredDtype !== servedDtype) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `local-light embedding dtype "${declaredDtype}" is not served by this deployment (served dtype: "${servedDtype}")`,
    });
  }
  return { ...capability, embedding: { ...capability.embedding, dtype: servedDtype } };
}

/** The warms that must land before any step reads provider facts: a detecting row's server probe, and Google's
 *  native catalog (its kind decides which tasks the row serves). Both need the credential, which is always the
 *  REGISTERED row's: its AAD binds the registered provider id, whatever the server turned out to be. `reached` is
 *  false when the detect probe found nothing answering at the URL, or when `cachedFacts` asked for no dial at all. */
async function warmBeforeFacts(
  ctx: ResolverContext,
  provider: ProviderDef,
  connection: UserConnection,
  cachedFacts: boolean,
): Promise<{ readonly behaved: ProviderDef; readonly earlyCredential: ResolvedSecret | null; readonly reached: boolean }> {
  const detecting = detectionUrl(provider, connection) !== null;
  if (cachedFacts) {
    return { behaved: await heldFacts(ctx, provider, connection), earlyCredential: null, reached: false };
  }
  if (provider.wire !== "google-generative-ai" && !detecting) {
    return { behaved: provider, earlyCredential: null, reached: true };
  }
  const earlyCredential = await ctx.deps.resolveCredential({ credentialId: connection.credentialId, ownerId: connection.ownerId, providerId: provider.id });
  const reached = detecting ? await ctx.warmDetect(connection, provider, earlyCredential.secret) : true;
  const behaved = behaveAs(ctx, provider, connection);
  if (provider.wire === "google-generative-ai") {
    await warmFor(ctx, behaved, connection, earlyCredential);
  }
  return { behaved, earlyCredential, reached };
}

/** Every warm a row's facts read, before any of them is read: the kind a server's catalog states decides which tasks
 *  the row serves, so the catalog lands first. */
async function warmFacts(
  ctx: ResolverContext,
  provider: ProviderDef,
  connection: UserConnection,
  cachedFacts: boolean,
): Promise<{ readonly behaved: ProviderDef; readonly credential: ResolvedSecret }> {
  const { behaved, earlyCredential, reached } = await warmBeforeFacts(ctx, provider, connection, cachedFacts);
  const credential =
    earlyCredential ?? (await ctx.deps.resolveCredential({ credentialId: connection.credentialId, ownerId: connection.ownerId, providerId: provider.id }));
  // A server that answered no detect probe will not answer its model list either; dialing it again only waits out
  // the same dead host a second time.
  if (provider.wire !== "google-generative-ai" && reached) {
    await warmFor(ctx, behaved, connection, credential);
  }
  return { behaved, credential };
}

/** The mirror `warmFor` fills for this row, or `undefined` where no catalog is read (a builtin row's closed set). */
function catalogMirrorOf(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection): Pick<Mirror<unknown>, "hydrate"> | undefined {
  if (provider.catalog === "builtin") {
    return;
  }
  if (provider.wire === "agent-sdk") {
    return ctx.agentSdkCatalog;
  }
  if (provider.dialect === "openrouter") {
    return ctx.openRouterCatalog;
  }
  const baseUrl = provider.baseUrl ?? connection.baseUrl;
  return baseUrl === null ? undefined : ctx.endpointModels(baseUrl, modelInfoApiOf(ctx, provider, connection), endpointMirrorTenant(connection));
}

/** The row whose facts a `cachedFacts` read reads, with every mirror it reads loaded from its persisted snapshot: what a
 *  warm would read first, so a restarted process agrees with the write that warms. Nothing is dialed. */
async function heldFacts(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection): Promise<ProviderDef> {
  const detectUrl = detectionUrl(provider, connection);
  if (detectUrl !== null) {
    await ctx.detectedServer(detectUrl).hydrate();
  }
  const behaved = behaveAs(ctx, provider, connection);
  await catalogMirrorOf(ctx, behaved, connection)?.hydrate();
  return behaved;
}

/** Whether the held mirrors carry every fact a warm would read for this row's kind: the detect answer, the catalog,
 *  and, for a listed model a server's native API describes, that model's own probe. */
function kindFactsHeld(ctx: ResolverContext, registered: ProviderDef, behaved: ProviderDef, connection: UserConnection): boolean {
  const detectUrl = detectionUrl(registered, connection);
  if (detectUrl !== null && ctx.detectedServer(detectUrl).get() === null) {
    return false;
  }
  if (behaved.catalog === "builtin") {
    return true;
  }
  if (behaved.dialect === "openrouter") {
    return ctx.openRouterCatalog.get() !== null;
  }
  const baseUrl = behaved.baseUrl ?? connection.baseUrl;
  if ((behaved.wire !== "openai-compat" && behaved.wire !== "google-generative-ai") || baseUrl === null) {
    return true;
  }
  const reader = modelInfoApiOf(ctx, behaved, connection);
  if (ctx.endpointModels(baseUrl, reader, endpointMirrorTenant(connection)).get() === null) {
    return false;
  }
  const entry = endpointEntryFor(ctx, { provider: behaved, connection, model: connection.model });
  // Only a native reader's probe can state a kind, and only where the list did not.
  return entry === undefined || reader === undefined || entry.probed === true || entry.kind !== undefined;
}

/** The kind a row's model is, as the resolver will read it: the catalog warmed first, then the declaration, the catalog
 *  and the curated rows. `undefined` when no evidence states one; the row's provider not being registered for its
 *  owner reads the same. */
export async function discoveredKind(ctx: ResolverContext, connection: UserConnection): Promise<ModelKind | undefined> {
  const provider = ctx.registry.get(connection.providerId, connection.ownerId);
  if (provider === undefined) {
    return;
  }
  return statedKind(ctx, { provider: await warmedOrCached(ctx, provider, connection), connection });
}

/** {@link discoveredKind} over the persisted facts only, dialing nothing. `held` is false when a warm could still change
 *  the kind (a catalog or detect answer never persisted, a listed model not yet probed): the server's own answer
 *  outranks a curated row, so only the row's declaration settles the kind without it. */
export async function cachedKind(ctx: ResolverContext, connection: UserConnection): Promise<{ readonly kind: ModelKind | undefined; readonly held: boolean }> {
  const provider = ctx.registry.get(connection.providerId, connection.ownerId);
  if (provider === undefined) {
    return { kind: undefined, held: true };
  }
  const behaved = await heldFacts(ctx, provider, connection);
  const kind = statedKind(ctx, { provider: behaved, connection });
  return { kind, held: connection.declared?.kind !== undefined || kindFactsHeld(ctx, provider, behaved, connection) };
}

// A kind read gathers evidence and never refuses: a revoked key or a server that does not answer leaves the facts the
// mirrors already hold, and the task that needs the key refuses with its own reason.
async function warmedOrCached(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection): Promise<ProviderDef> {
  // @orb-waive caught-failure-ownership(catch): the failed warm is owned by the next resolve of a task on this row, which runs the same warm and surfaces its error; the kind read degrades to the cached facts. Ends if a caller needs the kind read to refuse.
  try {
    return (await warmFacts(ctx, provider, connection, false)).behaved;
  } catch {
    return behaveAs(ctx, provider, connection);
  }
}

interface CapabilityResolveOutcome extends ResolveOutcome {
  readonly baseline: Capability;
}

async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: false): Promise<ResolveOutcome>;
async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: true): Promise<CapabilityResolveOutcome>;
async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: boolean): Promise<ResolveOutcome | CapabilityResolveOutcome> {
  const connection = await connectionFor(ctx, args);
  // Read as the connection's owner, so a row saved on a plugin provider stops resolving once none of that
  // owner's enabled installs contributes it (D147) — the same answer as an unregistered id.
  const provider = ctx.registry.get(connection.providerId, connection.ownerId);
  if (provider === undefined) {
    throw new NoConnectionError(
      `provider "${connection.providerId}" is not registered (a plugin provider reads no-connection unless one of the owner's enabled plugins contributes it)`,
    );
  }
  // Every fact read below goes through the behaved row; identity (`providerId`, `provider`, the credential and
  // every refusal's wording) stays the registered row's.
  const { behaved, credential } = await warmFacts(ctx, provider, connection, args.cachedFacts === true);
  const declared = connection.declared;
  const kind = kindOf(ctx, { task: args.task, provider: behaved, connection });
  const baselineKind = includeBaseline ? kindOf(ctx, { task: args.task, provider: behaved, connection, includeDeclared: false }) : undefined;
  const served = connectionTasks(behaved, kind);
  if (!served.includes(args.task)) {
    throw new ProviderError({
      kind: "forbidden",
      retryable: false,
      message: `connection "${connection.label}" (${provider.id}, ${kind}) cannot serve "${args.task}"`,
    });
  }
  const api = resolveApi(behaved, connection, kind);
  const model = normalizeModelId(connection.model, provider.wire === "agent-sdk" ? ctx.agentSdkCatalog.get() : null);
  const factsModel = factsModelFor(ctx, behaved, model);
  const family = detectModelFamily(factsModel);
  const rowQuery = { model: factsModel, providerId: behaved.id, wire: behaved.wire, api };
  const evidence: Evidence = {
    declared,
    // Matched per (model × route) like the curated rows — a measurement through OpenRouter never reaches the
    // direct wire, and one for opus-5 never reaches haiku.
    measured: measuredRows(rowQuery),
    advertised: advertisedFor(ctx, { provider: behaved, registered: provider, connection, model, kind }),
    curated: curatedRows(rowQuery),
  };
  const synthesized = synthesizeCapability(kind, family, evidence);
  // The trained maximum rides the server's catalog entry. With no entry (a cold mirror the warm could not
  // fill, a model the list does not carry, a native read that failed) it is unknown, so the window stays as
  // declared or folded: there is no number to clamp to.
  const entry = endpointEntryFor(ctx, { provider: behaved, connection, model });
  // D292: the row's own declaration or its server's advertisement states what a turn may carry; only a row
  // nobody described gets the permissive posture.
  const advertisedInput = advertisedStatesInput(entry);
  // The server-side floors, after synthesis: the endpoint posture, the server's tool-choice support, the trained clamp.
  const postured = (synthesizedCapability: Capability, inputStated: boolean): Capability =>
    clampToTrainedWindow(applyServerToolChoice(applyEndpointPosture(behaved, synthesizedCapability, inputStated), entry?.toolChoice), entry?.contextTrained);
  const capability = withLocalLightEmbedDtype(
    postured(synthesized.capability, declared?.generation?.input !== undefined || advertisedInput),
    provider,
    declared?.embedding?.dtype,
    ctx.deps.localLight?.embedDtype,
  );
  const baseline =
    baselineKind === undefined
      ? undefined
      : withLocalLightEmbedDtype(
          postured(
            synthesizeCapability(baselineKind, family, {
              ...evidence,
              declared: undefined,
              advertised: advertisedFor(ctx, { provider: behaved, registered: provider, connection, model, kind: baselineKind }),
            }).capability,
            advertisedInput,
          ),
          provider,
          undefined,
          ctx.deps.localLight?.embedDtype,
        );
  const features = behavedFeatures(provider, behaved, connection);
  const requirement = withWireRequirement(requirementMet(capability, taskDef(args.task).requires), args.task, provider, features);
  const resolved: Resolved = {
    task: args.task,
    ownerId: connection.ownerId,
    connectionId: connection.id,
    providerId: provider.id,
    wire: provider.wire,
    api,
    model,
    capability,
    requirement,
    provider,
    credential,
    baseUrl: provider.baseUrl ?? connection.baseUrl,
    features,
    extras: connection.extras,
    transport: connection.transport,
    allowBackground: connection.allowBackground,
    promptCache: effectivePromptCache(
      connection.promptCache,
      capability.kind === "generation" ? capability.generation.turns?.promptCacheDefaultEnabled : undefined,
      capability.kind === "generation" ? capability.generation.turns?.fixedCacheTtl : undefined,
    ),
    factsModel,
  };
  const warnings: ResolvedWarning[] = [...synthesized.warnings];
  if (!canFund(connection, args.task)) {
    warnings.push({
      code: "background_task_degraded",
      message: `"${args.task}" is a background task and connection "${connection.label}" does not allow background work`,
    });
  }
  return baseline === undefined ? { resolved, warnings } : { resolved, warnings, baseline };
}

export function resolveTask(ctx: ResolverContext, args: ResolveArgs): Promise<ResolveOutcome> {
  return resolveTaskFold(ctx, args, false);
}

/** The capability pane's read: normal resolution plus the same loaded evidence folded without the row's
 * declaration. Kept separate so turn-time resolution does not synthesize an unused baseline. */
export function resolveTaskWithBaseline(ctx: ResolverContext, args: ResolveArgs): Promise<CapabilityResolveOutcome> {
  return resolveTaskFold(ctx, args, true);
}
