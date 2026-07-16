// verb: add — upsert a credential (ownership-scoped). Seals the raw key with AES-256-GCM bound to
// `${ownerId}|${provider}`, then either rotates the existing (owner, provider, label) row in place
// (clearing revocation) or inserts a new one. First credential in a slot auto-marks active; later ones
// default inactive. TOCTOU loser of two concurrent first-adds -> CredentialsConflictError.

import { isConstraintViolation } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import type { CredentialContext } from "../context";
import { CREDENTIALS_OP_CODES, CredentialsConflictError } from "../contract/errors";
import type { AddCredentialParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import type { CredentialView } from "../contract/views";
import { aadFor } from "../persistence/aad";
import { fetchOwnedCredential, findSlotLabelRow, hasAnyInSlot, insertSealed, rotateSealed, toCredentialView } from "../persistence/queries";

const DEFAULT_LABEL = "default";

export function createAdd(ctx: CredentialContext): CredentialsService["add"] {
  return async (params: AddCredentialParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    const { provider } = params;
    if (!ctx.box.enabled) {
      throw new DomainOperationError(CREDENTIALS_OP_CODES.disabled, "Per-user credential storage is disabled (no CREDENTIALS_KEY configured).");
    }
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

    const firstInSlot = !(await hasAnyInSlot(ctx.db, ownerId, provider));
    const id = ctx.newCredentialId();
    try {
      await insertSealed(ctx.db, {
        id,
        ownerId,
        provider,
        label,
        sealed,
        metadata,
        active: firstInSlot,
        now,
      });
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
