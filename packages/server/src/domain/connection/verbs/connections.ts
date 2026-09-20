// verbs: list · get · create · update · remove — the `user_connections` WRITER (the one home; the runtime only
// reads). Every refusal is validation at the write seam, so a stored row is coherent by construction and the
// resolver never re-decides it: the provider is registered, the `api` is one the row lists, an endpoint row
// carries a URL (a hosted one does not), the URL parses and passes the F12 admission, the credential is the
// caller's, and the label is unique per owner (auto-minted `<provider> · <model>`, collision-suffixed).
// PD-139a (§10-4): a write that moves one of the caller's vector SPACES re-raises the purge+reindex trigger
// through `onEmbedSpaceChanged` — the settings-blob trigger this replaces enqueued the same workload. The
// condition is a before/after comparison of the resolved space tags (`substrate/embed-space.ts`), NOT a
// column diff: the space is derived from the row's model AND its resolved capability, so a provider or
// `declared` patch can move it without touching `model`, and an unrelated `declared` edit moves nothing.

import type { ConnectionApi, ProviderDef, ProviderId, UserConnection } from "@orb/contracts/inference";
import { connectionTasks } from "@orb/contracts/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CONNECTION_OP_CODES, ConnectionNotFoundError } from "../contract/errors.ts";
import type { CreateConnectionParams, UpdateConnectionParams } from "../contract/params.ts";
import type { ConnectionView, EmbedSpaces } from "../contract/results.ts";
import type { ConnectionContext, ConnectionService } from "../contract/service.ts";
import { listBindingsForActor } from "../persistence/bindings.ts";
import {
  deleteOwnedConnection,
  fetchOwnedConnection,
  insertConnection,
  listOwnedConnections,
  listOwnedLabels,
  updateOwnedConnection,
} from "../persistence/connections.ts";
import { spacesDiffer, VECTOR_TASKS, vectorSpacesOf } from "../substrate/embed-space.ts";
import { curatedKindOf } from "../substrate/kind.ts";

const LABEL_SEPARATOR = " · ";

function requireProvider(ctx: ConnectionContext, providerId: string): ProviderDef {
  const provider = ctx.runtime.providers.registry.get(providerId);
  if (provider === undefined) {
    throw new DomainOperationError(CONNECTION_OP_CODES.providerUnknown, `"${providerId}" is not a registered provider.`);
  }
  return provider;
}

function requireApi(provider: ProviderDef, api: ConnectionApi): void {
  if (api !== "auto" && !provider.apis.includes(api)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.apiIncoherent, `${provider.label} does not speak "${api}".`);
  }
}

/** The base-URL rule: an `auth: endpoint` row NEEDS one (parsed, admitted); every other provider fixes its
 *  own and the row must not carry one. */
function requireBaseUrl(ctx: ConnectionContext, provider: ProviderDef, baseUrl: string | null): void {
  if (provider.auth !== "endpoint") {
    if (baseUrl !== null) {
      throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlShape, `${provider.label} has a fixed endpoint; a connection may not name one.`);
    }
    return;
  }
  if (baseUrl === null) {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlShape, `${provider.label} is your own server — a base URL is required.`);
  }
  const admission = ctx.endpointAdmission(baseUrl);
  if (admission === "invalid") {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlInvalid, `"${baseUrl}" is not an http(s) URL.`);
  }
  if (admission === "refused") {
    throw new DomainOperationError(CONNECTION_OP_CODES.baseUrlRefused, `"${new URL(baseUrl).host}" is a private address this deployment does not admit.`);
  }
}

async function requireCredential(ctx: ConnectionContext, ownerId: UserId, credentialId: UserConnection["credentialId"]): Promise<void> {
  if (credentialId === null) {
    return;
  }
  if (!(await ctx.credentialOwned(ownerId, credentialId))) {
    throw new DomainOperationError(CONNECTION_OP_CODES.credentialForeign, `credential ${credentialId} is not yours.`);
  }
}

/** `<provider label> · <model>`, suffixed ` (2)`, ` (3)`… until it does not collide with the owner's labels. */
function mintLabel(provider: ProviderDef, model: string, taken: readonly string[], explicit: string | undefined): string {
  const base = explicit?.trim() !== undefined && explicit.trim() !== "" ? explicit.trim() : `${provider.label}${LABEL_SEPARATOR}${model}`;
  if (!taken.includes(base)) {
    return base;
  }
  let n = 2;
  while (taken.includes(`${base} (${String(n)})`)) {
    n += 1;
  }
  return `${base} (${String(n)})`;
}

function toView(ctx: ConnectionContext, row: UserConnection): ConnectionView {
  const provider = ctx.runtime.providers.registry.get(row.providerId);
  const kind = row.declared?.kind ?? (provider === undefined ? undefined : curatedKindOf(row, provider)) ?? "generation";
  return {
    ...row,
    providerLabel: provider?.label ?? row.providerId,
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

/** Is this row bound to a VECTOR task by the owner's `user` bindings? `remove` asks this BEFORE the delete,
 *  because after it there is no row left to resolve a before/after space comparison through. */
async function boundToVectorTask(ctx: ConnectionContext, ownerId: UserId, connectionId: UserConnectionId): Promise<boolean> {
  const bindings = await listBindingsForActor(ctx.db, { actorKind: "user", actorId: ownerId });
  return bindings.some((binding) => binding.connectionId === connectionId && VECTOR_TASKS.includes(binding.task));
}

export function createList(ctx: ConnectionContext): ConnectionService["list"] {
  return async (params): Promise<readonly ConnectionView[]> => (await listOwnedConnections(ctx.db, params.principal.userId)).map((row) => toView(ctx, row));
}

export function createGet(ctx: ConnectionContext): ConnectionService["get"] {
  return async (params): Promise<ConnectionView> => toView(ctx, await requireOwnedRow(ctx, params.principal.userId, params.connectionId));
}

export function createCreate(ctx: ConnectionContext): ConnectionService["create"] {
  return async (params: CreateConnectionParams): Promise<ConnectionView> => {
    const ownerId = params.principal.userId;
    const provider = requireProvider(ctx, params.providerId);
    const api = params.api ?? "auto";
    requireApi(provider, api);
    requireBaseUrl(ctx, provider, params.baseUrl);
    await requireCredential(ctx, ownerId, params.credentialId);
    const model = params.model.trim();
    if (model === "") {
      throw new DomainOperationError(CONNECTION_OP_CODES.taskUnservable, "a connection needs a model — pick one from the list or type its id.");
    }
    const label = mintLabel(provider, model, await listOwnedLabels(ctx.db, ownerId), params.label);
    const now = ctx.now();
    const id = ctx.newConnectionId();
    await insertConnection(ctx.db, {
      id,
      ownerId,
      label,
      providerId: castId<ProviderId>(provider.id),
      credentialId: params.credentialId,
      baseUrl: params.baseUrl,
      model,
      api,
      declared: params.declared ?? null,
      extras: params.extras ?? null,
      transport: params.transport ?? null,
      modelListed: params.modelListed ?? true,
      allowBackground: params.allowBackground ?? false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.audit(
      { actorUserId: ownerId, action: "connection.create", entityType: "connection", entityId: id, metadata: { providerId: provider.id, model } },
      now,
    );
    return toView(ctx, await requireOwnedRow(ctx, ownerId, id));
  };
}

/** The columns a patch may write, re-validated against the row's (possibly patched) provider. */
async function validatedPatch(
  ctx: ConnectionContext,
  ownerId: UserId,
  row: UserConnection,
  patch: UpdateConnectionParams["patch"],
): Promise<Partial<UserConnection>> {
  const providerId = patch.providerId ?? row.providerId;
  const provider = requireProvider(ctx, providerId);
  const api = patch.api ?? row.api;
  requireApi(provider, api);
  const baseUrl = patch.baseUrl ?? row.baseUrl;
  requireBaseUrl(ctx, provider, baseUrl);
  const credentialId = patch.credentialId ?? row.credentialId;
  await requireCredential(ctx, ownerId, credentialId);
  const model = patch.model === undefined ? row.model : patch.model.trim();
  if (model === "") {
    throw new DomainOperationError(CONNECTION_OP_CODES.taskUnservable, "a connection needs a model.");
  }
  return {
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    providerId: castId<ProviderId>(provider.id),
    credentialId,
    baseUrl,
    model,
    api,
    ...(patch.declared !== undefined ? { declared: patch.declared } : {}),
    ...(patch.extras !== undefined ? { extras: patch.extras } : {}),
    ...(patch.transport !== undefined ? { transport: patch.transport } : {}),
    ...(patch.modelListed !== undefined ? { modelListed: patch.modelListed } : {}),
    ...(patch.allowBackground !== undefined ? { allowBackground: patch.allowBackground } : {}),
  };
}

export function createUpdate(ctx: ConnectionContext): ConnectionService["update"] {
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
    if (spacesDiffer(before, await vectorSpacesOf(ctx, params.principal))) {
      ctx.onEmbedSpaceChanged(ownerId);
    }
    return toView(ctx, await requireOwnedRow(ctx, ownerId, row.id));
  };
}

export function createRemove(ctx: ConnectionContext): ConnectionService["remove"] {
  return async (params): Promise<void> => {
    const ownerId = params.principal.userId;
    const row = await requireOwnedRow(ctx, ownerId, params.connectionId);
    const wasVector = await boundToVectorTask(ctx, ownerId, row.id);
    await deleteOwnedConnection(ctx.db, ownerId, row.id);
    await ctx.audit({ actorUserId: ownerId, action: "connection.remove", entityType: "connection", entityId: row.id }, ctx.now());
    if (wasVector) {
      ctx.onEmbedSpaceChanged(ownerId);
    }
  };
}
