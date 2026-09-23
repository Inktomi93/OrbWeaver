// verb: add — upsert a credential (ownership-scoped). Seals the raw key with AES-256-GCM bound to
// `${ownerId}|${providerId}`, then either rotates the existing (owner, provider, label) row in place
// (clearing revocation) or inserts a new one. No `active` flag any more (inference program §5.3): which key a
// turn uses is the CONNECTION's `credentialId`, so a second key on the same provider is just a second labelled
// row. The provider id is validated against the REGISTRY before anything is sealed — it is half the AAD, and a
// key sealed under an unknown id could never be opened. TOCTOU loser of two concurrent first-adds ->
// CredentialsConflictError.

import { isConstraintViolation } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import type { CredentialContext } from "../context.ts";
import { CREDENTIALS_OP_CODES, CredentialsConflictError } from "../contract/errors.ts";
import type { AddCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import type { CredentialView } from "../contract/views.ts";
import { aadFor } from "../persistence/aad.ts";
import { fetchOwnedCredential, findSlotLabelRow, insertSealed, rotateSealed, toCredentialView } from "../persistence/queries.ts";

const DEFAULT_LABEL = "default";

export function createAdd(ctx: CredentialContext): CredentialsService["add"] {
  return async (params: AddCredentialParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    if (!ctx.box.enabled) {
      throw new DomainOperationError(CREDENTIALS_OP_CODES.disabled, "Per-user credential storage is disabled (no CREDENTIALS_KEY configured).");
    }
    const registeredProvider = ctx.findProvider(params.provider, ownerId);
    if (registeredProvider === undefined) {
      throw new DomainOperationError(CREDENTIALS_OP_CODES.providerUnknown, `"${params.provider}" is not a registered provider.`);
    }
    const provider = registeredProvider.id;
    const trimmedLabel = params.label?.trim();
    const label = trimmedLabel !== undefined && trimmedLabel !== "" ? trimmedLabel : DEFAULT_LABEL;
    const metadata = params.metadata ?? null;
    const sealed = ctx.box.encrypt(params.key.trim(), aadFor(ownerId, provider));
    const now = ctx.now();

    const existing = await findSlotLabelRow(ctx.db, ownerId, provider, label);
    if (existing !== undefined) {
      await rotateSealed(ctx.db, { credentialId: existing.id, sealed, metadata, now });
      await ctx.audit(
        { actorUserId: ownerId, action: "credential.add", entityType: "credential", entityId: existing.id, metadata: { provider, label, rotated: true } },
        now,
      );
      ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId: existing.id });
      return reloadView(ctx, ownerId, existing.id);
    }

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
    await ctx.audit(
      { actorUserId: ownerId, action: "credential.add", entityType: "credential", entityId: id, metadata: { provider, label, rotated: false } },
      now,
    );
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId: id });
    return reloadView(ctx, ownerId, id);
  };
}

async function reloadView(ctx: CredentialContext, ownerId: UserId, id: UserCredentialId): Promise<CredentialView> {
  const row = await fetchOwnedCredential(ctx.db, ownerId, id);
  if (row === undefined) {
    throw new DomainOperationError(CREDENTIALS_OP_CODES.notFound, `credential ${id} vanished immediately after write`);
  }
  return toCredentialView(row);
}
