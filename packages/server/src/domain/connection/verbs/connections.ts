// verbs: list · get · create · update · remove — the `user_connections` WRITER (the one home; the runtime only
// reads). Every refusal is validation at the write seam, so a stored row is coherent by construction and the
// resolver never re-decides it: the provider is one the owner may use, the `api` is one the row lists, an
// endpoint row carries a URL (a hosted one does not), the URL parses and passes the F12 admission, the
// credential is the caller's, and the label is unique per owner (auto-minted `<provider> · <model>`,
// collision-suffixed).
// (§10-4) a write that moves one of the caller's vector SPACES onto a space that can embed raises
// `onEmbedSpaceChanged`, which syncs the owner's stored target and queues the rebuild if it moved. The
// filter is a before/after comparison of the resolved space tags (`substrate/embed-space.ts`), NOT a
// column diff: the space is derived from the row's model AND its resolved capability, so a provider or
// `declared` patch can move it without touching `model`, and an unrelated `declared` edit moves nothing.

import type { ConnectionApi, ModelCheck, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { CONNECTION_LABEL_SEPARATOR, CONNECTION_OP_CODES, connectionTasks, isHubModelId, modelIdSchema, providerDisplayLabel } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { nextFreeLabel } from "@orb/kit/strings";
import { ConnectionNotFoundError } from "../contract/errors.ts";
import type { CreateConnectionParams, UpdateConnectionParams } from "../contract/params.ts";
import type { ConnectionView, EmbedSpaces } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import {
  deleteOwnedConnection,
  fetchOwnedConnection,
  insertConnection,
  listOwnedConnections,
  listOwnedLabels,
  updateOwnedConnection,
} from "../persistence/connections.ts";
import { requireBaseUrl, requireCredential, requireProvider } from "../substrate/admission.ts";
import { spacesMayMoveTarget, vectorSpacesOf } from "../substrate/embed-space.ts";
import { curatedKindOf } from "../substrate/kind.ts";

function requireLabel(raw: string): string {
  const label = raw.trim();
  if (label === "") {
    throw new DomainOperationError(CONNECTION_OP_CODES.labelEmpty, "a connection needs a name — type one, or keep the current name.");
  }
  return label;
}

function requireModelId(raw: string): ModelId {
  const parsed = modelIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainOperationError(CONNECTION_OP_CODES.taskUnservable, "a connection needs a model — pick one from the list or type its id.");
  }
  return parsed.data;
}

/** A `builtin` catalog is the closed set the in-process runtime can load, so an id outside it can only be a
 *  typo; a `url` catalog can lag its provider and admits any id (§7.4). A `local-light` id is still refused
 *  unless it is a Hub `owner/repo`, whatever the catalog: the in-process loader reads any other id as a path. */
function requireCatalogModel(ctx: ConnectionContext, ownerId: UserId, provider: ProviderDef, model: ModelId): void {
  if (provider.wire === "local-light" && !isHubModelId(model)) {
    throw new DomainOperationError(
      CONNECTION_OP_CODES.modelIdShape,
      `${provider.label} loads Hugging Face models only: use the model's "owner/repo" id, not a path or URL.`,
    );
  }
  const closed = ctx.runtime.catalogs.builtin(provider.id, ownerId);
  if (closed !== null && !closed.some((entry) => entry.id === model)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.modelNotInCatalog, `${provider.label} does not run "${model}" — pick one of its listed models.`);
  }
}

function requireApi(provider: ProviderDef, api: ConnectionApi): void {
  if (api !== "auto" && !provider.apis.includes(api)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.apiIncoherent, `${provider.label} does not speak "${api}".`);
  }
}

/** `<provider label> · <model>`, suffixed ` (2)`, ` (3)`… until it does not collide with the owner's labels. */
function mintLabel(provider: ProviderDef, model: string, taken: readonly string[], explicit: string | undefined): string {
  const base =
    explicit?.trim() !== undefined && explicit.trim() !== "" ? explicit.trim() : `${providerDisplayLabel(provider)}${CONNECTION_LABEL_SEPARATOR}${model}`;
  return nextFreeLabel(base, taken);
}

function toView(ctx: ConnectionContext, row: UserConnection): ConnectionView {
  const provider = ctx.runtime.providers.registry.get(row.providerId, row.ownerId);
  const kind = row.declared?.kind ?? (provider === undefined ? undefined : curatedKindOf(row, provider)) ?? "generation";
  return {
    ...row,
    providerLabel: provider === undefined ? row.providerId : providerDisplayLabel(provider),
    tasks: provider === undefined ? [] : connectionTasks(provider, kind),
  };
}

async function requireOwnedRow(ctx: ConnectionContext, ownerId: UserId, connectionId: UserConnectionId): Promise<UserConnection> {
  const row = await fetchOwnedConnection(ctx.db, ownerId, connectionId);
  if (row === null) {
    throw new ConnectionNotFoundError(connectionId);
  }
  return row;
}

function createList(ctx: ConnectionContext): ConnectionService["list"] {
  return async (params): Promise<readonly ConnectionView[]> => (await listOwnedConnections(ctx.db, params.principal.userId)).map((row) => toView(ctx, row));
}

function createGet(ctx: ConnectionContext): ConnectionService["get"] {
  return async (params): Promise<ConnectionView> => toView(ctx, await requireOwnedRow(ctx, params.principal.userId, params.connectionId));
}

function createCreate(ctx: ConnectionContext): ConnectionService["create"] {
  return async (params: CreateConnectionParams): Promise<ConnectionView> => {
    const ownerId = params.principal.userId;
    const provider = requireProvider(ctx, ownerId, params.providerId);
    const api = params.api ?? "auto";
    requireApi(provider, api);
    await requireBaseUrl(ctx, provider, params.baseUrl);
    await requireCredential(ctx, ownerId, params.credentialId);
    const model = requireModelId(params.model);
    requireCatalogModel(ctx, ownerId, provider, model);
    const label = mintLabel(provider, model, await listOwnedLabels(ctx.db, ownerId), params.label);
    const now = ctx.now();
    const id = ctx.newConnectionId();
    await insertConnection(ctx.db, {
      id,
      ownerId,
      label,
      providerId: provider.id,
      credentialId: params.credentialId,
      baseUrl: params.baseUrl,
      model,
      api,
      declared: params.declared ?? null,
      extras: params.extras ?? null,
      transport: params.transport ?? null,
      modelCheck: params.modelCheck ?? "unchecked",
      allowBackground: params.allowBackground ?? false,
      promptCache: params.promptCache ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.audit(
      { actorUserId: ownerId, action: "connection.create", entityType: "connection", entityId: id, metadata: { providerId: provider.id, model } },
      now,
    );
    const created = await requireOwnedRow(ctx, ownerId, id);
    // A new row asks the server again too: a model pulled since its mirror was warmed is absent from it, and
    // an absent model reads the generic floor instead of what its server states.
    await ctx.runtime.catalogs.invalidateEndpoint(created);
    ctx.emitUserEvent(ownerId, { type: "connectionsChanged" });
    return toView(ctx, created);
  };
}

/** A new model with no check of its own is `unchecked`: the stored answer was about the previous id. */
function modelCheckPatch(row: UserConnection, model: ModelId, modelCheck: ModelCheck | undefined): Pick<Partial<UserConnection>, "modelCheck"> {
  if (modelCheck !== undefined) {
    return { modelCheck };
  }
  return model === row.model ? {} : { modelCheck: "unchecked" };
}

/** The columns a patch may write, re-validated against the row's (possibly patched) provider. */
async function validatedPatch(
  ctx: ConnectionContext,
  ownerId: UserId,
  row: UserConnection,
  patch: UpdateConnectionParams["patch"],
): Promise<Partial<UserConnection>> {
  const providerId = patch.providerId ?? row.providerId;
  const provider = requireProvider(ctx, ownerId, providerId);
  const api = patch.api ?? row.api;
  requireApi(provider, api);
  const baseUrl = patch.baseUrl ?? row.baseUrl;
  await requireBaseUrl(ctx, provider, baseUrl);
  const credentialId = patch.credentialId ?? row.credentialId;
  await requireCredential(ctx, ownerId, credentialId);
  const model = patch.model === undefined ? row.model : requireModelId(patch.model);
  // Judged only when the patch moves the model or the provider: an unrelated edit never re-decides a stored id.
  if (patch.model !== undefined || patch.providerId !== undefined) {
    requireCatalogModel(ctx, ownerId, provider, model);
  }
  return {
    ...(patch.label !== undefined ? { label: requireLabel(patch.label) } : {}),
    providerId: provider.id,
    credentialId,
    baseUrl,
    model,
    api,
    ...(patch.declared !== undefined ? { declared: patch.declared } : {}),
    ...(patch.extras !== undefined ? { extras: patch.extras } : {}),
    ...(patch.transport !== undefined ? { transport: patch.transport } : {}),
    ...modelCheckPatch(row, model, patch.modelCheck),
    ...(patch.allowBackground !== undefined ? { allowBackground: patch.allowBackground } : {}),
    ...(patch.promptCache !== undefined ? { promptCache: patch.promptCache } : {}),
  };
}

function createUpdate(ctx: ConnectionContext): ConnectionService["update"] {
  return async (params: UpdateConnectionParams): Promise<ConnectionView> => {
    const ownerId = params.principal.userId;
    const row = await requireOwnedRow(ctx, ownerId, params.connectionId);
    const patch = await validatedPatch(ctx, ownerId, row, params.patch);
    // Snapshot BEFORE the write: after it, "what did this used to resolve to" is unanswerable.
    const before: EmbedSpaces = await vectorSpacesOf(ctx, params.principal);
    const now = ctx.now();
    await updateOwnedConnection(ctx.db, ownerId, row.id, { ...patch, updatedAt: now });
    await ctx.audit(
      { actorUserId: ownerId, action: "connection.update", entityType: "connection", entityId: row.id, metadata: { fields: Object.keys(params.patch) } },
      now,
    );
    if (spacesMayMoveTarget(before, await vectorSpacesOf(ctx, params.principal))) {
      ctx.onEmbedSpaceChanged(ownerId);
    }
    const saved = await requireOwnedRow(ctx, ownerId, row.id);
    // A save is the user's "ask the server again": the row's advertised facts are re-read on its next resolve.
    await ctx.runtime.catalogs.invalidateEndpoint(saved);
    ctx.emitUserEvent(ownerId, { type: "connectionsChanged" });
    return toView(ctx, saved);
  };
}

function createRemove(ctx: ConnectionContext): ConnectionService["remove"] {
  return async (params): Promise<void> => {
    const ownerId = params.principal.userId;
    const row = await requireOwnedRow(ctx, ownerId, params.connectionId);
    // No embed-space trigger: the delete sets every binding on the row to nothing, and nothing can embed there.
    await deleteOwnedConnection(ctx.db, ownerId, row.id);
    await ctx.audit({ actorUserId: ownerId, action: "connection.remove", entityType: "connection", entityId: row.id }, ctx.now());
    ctx.emitUserEvent(ownerId, { type: "connectionsChanged" });
  };
}

/** The slice of `ConnectionService` this grouped file owns. */
type ConnectionRowVerbs = Pick<ConnectionService, "list" | "get" | "create" | "update" | "remove">;

/** The `user_connections` verb bundle (`verb-naming`: one factory named for the file). */
export function createConnections(ctx: ConnectionContext): ConnectionRowVerbs {
  return {
    list: createList(ctx),
    get: createGet(ctx),
    create: createCreate(ctx),
    update: createUpdate(ctx),
    remove: createRemove(ctx),
  };
}
