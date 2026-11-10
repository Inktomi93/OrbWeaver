// The column rules a connection's create and update both pass: the model id, its catalog, the row's `api`, and the
// re-validated update patch. A substrate home, so the embed-space preview judges a patch the way `update` writes it.

import type { ConnectionApi, ModelCheck, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, connectionApiAllowed, isHubModelId, modelIdSchema } from "@orb/contracts/inference";
import { requiresHubModelId } from "@orb/inference";
import { DomainOperationError } from "@orb/kit/errors";
import type { ModelId, UserId } from "@orb/kit/ids";
import type { UpdateConnectionParams } from "../contract/params.ts";
import type { ConnectionContext } from "../contract/service.ts";
import { requireBaseUrl, requireCredential, requireProvider } from "./admission.ts";

function requireLabel(raw: string): string {
  const label = raw.trim();
  if (label === "") {
    throw new DomainOperationError(CONNECTION_OP_CODES.labelEmpty, "a connection needs a name — type one, or keep the current name.");
  }
  return label;
}

export function requireModelId(raw: string): ModelId {
  const parsed = modelIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DomainOperationError(CONNECTION_OP_CODES.taskUnservable, "a connection needs a model — pick one from the list or type its id.");
  }
  return parsed.data;
}

/** A `builtin` catalog is the closed set the in-process runtime can load, so an id outside it can only be a
 *  typo; a `url` catalog can lag its provider and admits any id (§7.4). A `local-light` id is still refused
 *  unless it is a Hub `owner/repo`, whatever the catalog: the in-process loader reads any other id as a path. */
export function requireCatalogModel(ctx: ConnectionContext, ownerId: UserId, provider: ProviderDef, model: ModelId): void {
  if (requiresHubModelId(provider) && !isHubModelId(model)) {
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

export function requireApi(provider: ProviderDef, api: ConnectionApi): void {
  if (!connectionApiAllowed(provider, api)) {
    throw new DomainOperationError(CONNECTION_OP_CODES.apiIncoherent, `${provider.label} does not speak "${api}".`);
  }
}

/** A new model with no check of its own is `unchecked`: the stored answer was about the previous id. */
function modelCheckPatch(row: UserConnection, model: ModelId, modelCheck: ModelCheck | undefined): Pick<Partial<UserConnection>, "modelCheck"> {
  if (modelCheck !== undefined) {
    return { modelCheck };
  }
  return model === row.model ? {} : { modelCheck: "unchecked" };
}

/** A declared reranker window describes the model it was declared on, so a new model without a declaration of
 *  its own sheds it, as the seed's own move does; carried over, it could exceed the new model's positions. */
function declaredPatch(row: UserConnection, model: ModelId, declared: UpdateConnectionParams["patch"]["declared"]): Pick<Partial<UserConnection>, "declared"> {
  if (declared !== undefined) {
    return { declared };
  }
  if (model === row.model || row.declared?.rerank === undefined) {
    return {};
  }
  const { rerank: _earlierModelFacts, ...kept } = row.declared;
  return { declared: Object.keys(kept).length === 0 ? null : kept };
}

type IdentityColumns = Pick<UserConnection, "providerId" | "credentialId" | "baseUrl" | "model" | "api">;

/** The validated identity columns the patch names, and only those. The row was read before the awaited checks, so
 *  writing an unnamed column back from it would revert a write that landed meanwhile. */
function namedIdentityColumns(patch: UpdateConnectionParams["patch"], values: IdentityColumns): Partial<IdentityColumns> {
  return {
    ...(patch.providerId !== undefined ? { providerId: values.providerId } : {}),
    ...(patch.credentialId !== undefined ? { credentialId: values.credentialId } : {}),
    ...(patch.baseUrl !== undefined ? { baseUrl: values.baseUrl } : {}),
    ...(patch.model !== undefined ? { model: values.model } : {}),
    ...(patch.api !== undefined ? { api: values.api } : {}),
  };
}

/** The columns a patch may write, re-validated against the row's (possibly patched) provider. */
export async function validatedPatch(
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
    ...namedIdentityColumns(patch, { providerId: provider.id, credentialId, baseUrl, model, api }),
    ...declaredPatch(row, model, patch.declared),
    ...(patch.extras !== undefined ? { extras: patch.extras } : {}),
    ...(patch.transport !== undefined ? { transport: patch.transport } : {}),
    ...modelCheckPatch(row, model, patch.modelCheck),
    ...(patch.allowBackground !== undefined ? { allowBackground: patch.allowBackground } : {}),
    ...(patch.promptCache !== undefined ? { promptCache: patch.promptCache } : {}),
  };
}
