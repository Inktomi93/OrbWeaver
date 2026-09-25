// verb: add — seal and insert a NEW credential; it never overwrites one, so a taken label (the implicit
// "default" too) gets the next free spelling and `replace` is the only way a stored secret changes. The
// provider is checked against the registry before sealing: its id is half the AAD.

import { isConstraintViolation } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import { nextFreeLabel } from "@orb/kit/strings";
import type { CredentialContext } from "../context.ts";
import { CREDENTIALS_OP_CODES, CredentialsConflictError } from "../contract/errors.ts";
import type { AddCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import type { CredentialView } from "../contract/views.ts";
import { aadFor } from "../persistence/aad.ts";
import { insertSealed, listProviderLabels } from "../persistence/queries.ts";
import { reloadView, requireStorage } from "../substrate/stored.ts";

const DEFAULT_LABEL = "default";

export function createAdd(ctx: CredentialContext): CredentialsService["add"] {
  return async (params: AddCredentialParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    requireStorage(ctx);
    const registeredProvider = ctx.findProvider(params.provider, ownerId);
    if (registeredProvider === undefined) {
      throw new DomainOperationError(CREDENTIALS_OP_CODES.providerUnknown, `"${params.provider}" is not a registered provider.`);
    }
    const provider = registeredProvider.id;
    const trimmedLabel = params.label?.trim();
    const wanted = trimmedLabel !== undefined && trimmedLabel !== "" ? trimmedLabel : DEFAULT_LABEL;
    const label = nextFreeLabel(wanted, await listProviderLabels(ctx.db, ownerId, provider));
    const metadata = params.metadata ?? null;
    const sealed = ctx.box.encrypt(params.key.trim(), aadFor(ownerId, provider));
    const now = ctx.now();

    const id = ctx.newCredentialId();
    try {
      await insertSealed(ctx.db, { id, ownerId, provider, label, sealed, metadata, now });
    } catch (err) {
      if (isConstraintViolation(err)?.kind === "unique") {
        const conflict = new CredentialsConflictError(`A ${provider} credential already exists for this slot — refresh and retry.`);
        conflict.cause = err;
        throw conflict;
      }
      throw err;
    }
    await ctx.audit({ actorUserId: ownerId, action: "credential.add", entityType: "credential", entityId: id, metadata: { provider, label } }, now);
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId: id });
    return reloadView(ctx, ownerId, id);
  };
}
