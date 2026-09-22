// The resolver: `(task, principal, actor?, requires?)` → `Resolved<Task>`, in ONE fold, reading only the
// principal's own rows. The steps, in order and each with its refusal named:
//   1. the §7.1 binding fold (no row ⇒ `no-connection`, never a born default — F2/F16);
//   2. the connection row — it must be the FUNDER's (a binding that names a stranger's row is a domain bug,
//      refused and recorded, never served);
//   3. the provider row from the registry (a dropped plugin provider ⇒ `no-connection`);
//   4. the model's KIND: the OpenRouter catalog row → curated → the row's `declared.kind` → the task's own
//      kind; then `connectionTasks` decides whether this row may serve the task at all;
//   5. api coherence (data), the secret (by id, the funder's), the model id normalised (no heal);
//   6. the catalog warm this provider's `catalog` strategy owns, then the evidence bundle → synthesis →
//      the endpoint posture floors → the features fold;
//   7. the requirement verdict and `canFund` — VERDICTS on the result, never throws.

import type { Principal } from "@orb/contracts/identity";
import type {
  AgentSdkModel,
  Capability,
  EndpointFeatures,
  ModelCatalogEntry,
  ModelKind,
  ProviderDef,
  RequirementVerdict,
  Task,
  UserConnection,
} from "@orb/contracts/inference";
import { canFund, connectionTasks, foldFeatures, modelIdSchema, requirementMet, taskDef } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { resolveEmbedDtype } from "../backends/local-light/model-cache.ts";
import { detectModelFamily } from "../capability/families.ts";
import { applyEndpointPosture } from "../capability/floor.ts";
import { advertisedFromAgentSdk, agentSdkRowFor } from "../capability/sources/advertised/agent-sdk.ts";
import { advertisedFromOpenAiCompat } from "../capability/sources/advertised/openai-compat.ts";
import { advertisedFromOpenRouter } from "../capability/sources/advertised/openrouter.ts";
import { curatedKind, curatedRows } from "../capability/sources/curated/loader.ts";
import { measuredRows } from "../capability/sources/measured/loader.ts";
import type { Evidence } from "../capability/synthesize.ts";
import { synthesizeCapability } from "../capability/synthesize.ts";
import type { Mirror } from "../catalog/mirror.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolvedWarning } from "../contract/resolve.ts";
import type { Resolved } from "../contract/resolved.ts";
import type { EndpointModel } from "../contract/runtime.ts";
import type { BindingActor, InferenceDeps } from "../deps.ts";
import type { ProviderRegistry } from "../registry/providers.ts";
import { resolveApi } from "./coherence.ts";
import { normalizeModelId } from "./heal.ts";
import { foldBindings } from "./precedence.ts";

export interface ResolveArgs {
  readonly task: Task;
  readonly principal: Principal;
  readonly actor?: BindingActor | undefined;
  /** An explicit row instead of the fold — the turn's own already-resolved connection re-read, a pane preview. */
  readonly connectionId?: UserConnection["id"] | undefined;
}

/** Everything the resolver reads that is not a dep: the registry + the catalog mirrors + the warms. */
export interface ResolverContext {
  readonly deps: InferenceDeps;
  readonly registry: ProviderRegistry;
  readonly openRouterCatalog: Mirror<ModelCatalogEntry[]>;
  readonly endpointModels: (baseUrl: string) => Mirror<EndpointModel[]>;
  readonly agentSdkCatalog: Mirror<AgentSdkModel[]>;
  readonly warmOpenRouter: () => Promise<void>;
  readonly warmEndpoint: (connection: UserConnection, provider: ProviderDef, secret: string | null) => Promise<void>;
  readonly warmAgentSdk: (connection: UserConnection) => Promise<void>;
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
  const { task, provider, connection } = args;
  const catalogRow = provider.dialect === "openrouter" ? ctx.openRouterCatalog.get()?.find((entry) => entry.id === connection.model) : undefined;
  return (
    (args.includeDeclared === false ? undefined : connection.declared?.kind) ??
    catalogRow?.kind ??
    curatedKind({ model: connection.model, providerId: provider.id, wire: provider.wire }) ??
    taskDef(task).kind
  );
}

function advertisedFor(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection, model: ModelId): Evidence["advertised"] {
  if (provider.wire === "agent-sdk") {
    const row = agentSdkRowFor(model, ctx.agentSdkCatalog.get());
    return row === undefined ? undefined : advertisedFromAgentSdk(row);
  }
  if (provider.dialect === "openrouter") {
    const entry = ctx.openRouterCatalog.get()?.find((candidate) => candidate.id === model);
    return entry === undefined ? undefined : advertisedFromOpenRouter(entry);
  }
  const baseUrl = provider.wire === "openai-compat" ? (provider.baseUrl ?? connection.baseUrl) : null;
  const entry =
    baseUrl === null
      ? undefined
      : ctx
          .endpointModels(baseUrl)
          .get()
          ?.find((candidate) => candidate.id === model);
  return entry === undefined ? undefined : advertisedFromOpenAiCompat(entry);
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

async function warmFor(ctx: ResolverContext, provider: ProviderDef, connection: UserConnection, secret: string | null): Promise<void> {
  if (provider.catalog === "builtin") {
    return;
  }
  if (provider.wire === "agent-sdk") {
    await ctx.warmAgentSdk(connection);
    return;
  }
  if (provider.dialect === "openrouter") {
    await ctx.warmOpenRouter();
    return;
  }
  await ctx.warmEndpoint(connection, provider, secret);
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

interface CapabilityResolveOutcome extends ResolveOutcome {
  readonly baseline: Capability;
}

async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: false): Promise<ResolveOutcome>;
async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: true): Promise<CapabilityResolveOutcome>;
async function resolveTaskFold(ctx: ResolverContext, args: ResolveArgs, includeBaseline: boolean): Promise<ResolveOutcome | CapabilityResolveOutcome> {
  const connection = await connectionFor(ctx, args);
  const provider = ctx.registry.get(connection.providerId);
  if (provider === undefined) {
    throw new NoConnectionError(`provider "${connection.providerId}" is not registered (a plugin provider reads no-connection until its plugin activates)`);
  }
  const declared = connection.declared;
  const kind = kindOf(ctx, { task: args.task, provider, connection });
  const baselineKind = includeBaseline ? kindOf(ctx, { task: args.task, provider, connection, includeDeclared: false }) : undefined;
  const served = connectionTasks(provider, kind);
  if (!served.includes(args.task)) {
    throw new ProviderError({
      kind: "forbidden",
      retryable: false,
      message: `connection "${connection.label}" (${provider.id}, ${kind}) cannot serve "${args.task}"`,
    });
  }
  const api = resolveApi(provider, connection, kind);
  const credential = await ctx.deps.resolveCredential({ credentialId: connection.credentialId, ownerId: connection.ownerId, providerId: provider.id });
  await warmFor(ctx, provider, connection, credential.secret);
  const model = normalizeModelId(connection.model, provider.wire === "agent-sdk" ? ctx.agentSdkCatalog.get() : null);
  const factsModel = factsModelFor(ctx, provider, model);
  const family = detectModelFamily(factsModel);
  const rowQuery = { model: factsModel, providerId: provider.id, wire: provider.wire, api };
  const evidence: Evidence = {
    declared,
    // Matched per (model × route) like the curated rows — a measurement through OpenRouter never reaches the
    // direct wire, and one for opus-5 never reaches haiku.
    measured: measuredRows(rowQuery),
    advertised: advertisedFor(ctx, provider, connection, model),
    curated: curatedRows(rowQuery),
  };
  const synthesized = synthesizeCapability(kind, family, evidence);
  const capability = withLocalLightEmbedDtype(
    applyEndpointPosture(provider, synthesized.capability, declared?.generation?.input !== undefined),
    provider,
    declared?.embedding?.dtype,
    ctx.deps.localLight?.embedDtype,
  );
  const baseline =
    baselineKind === undefined
      ? undefined
      : withLocalLightEmbedDtype(
          applyEndpointPosture(provider, synthesizeCapability(baselineKind, family, { ...evidence, declared: undefined }).capability, false),
          provider,
          undefined,
          ctx.deps.localLight?.embedDtype,
        );
  const features = foldFeatures(provider.features, declared?.features);
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
