// verb: add — upsert a credential (ownership-scoped). Seals the raw key with AES-256-GCM bound to
// `${ownerId}|${provider}` (the AAD belt — the SecretBox CARRIES the value from `aadFor`, never derives
// it), then either ROTATES the existing `(owner, provider, label)` row in place (clearing revocation — a
// fresh key voids the "rejected" state) or INSERTS a new one. The first credential in a `(owner, provider)`
// slot is auto-marked active; later ones default inactive (the user promotes via `setActive`). The TOCTOU
// loser of two concurrent first-adds collides on the partial active-unique index → `CredentialsConflictError`.

import { isConstraintViolation } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES, CredentialsConflictError } from "../contract/errors";
import type { AddCredentialParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import type { CredentialView } from "../contract/views";
import { aadFor } from "../persistence/aad";
import {
  fetchOwnedCredential,
  findSlotLabelRow,
  hasAnyInSlot,
  insertSealed,
  rotateSealed,
  toCredentialView,
} from "../persistence/queries";

const DEFAULT_LABEL = "default";

export function createAdd(ctx: CredentialContext): CredentialsService["add"] {
  return async (params: AddCredentialParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    const { provider } = params;
    if (!ctx.box.enabled) {
      throw new DomainOperationError(
        CREDENTIALS_OP_CODES.disabled,
        "Per-user credential storage is disabled (no CREDENTIALS_KEY configured).",
      );
    }
    const label = params.label?.trim() || DEFAULT_LABEL;
    const metadata = params.metadata ?? null;
    const sealed = ctx.box.encrypt(params.key.trim(), aadFor(ownerId, provider));
    const now = ctx.now();

    const existing = await findSlotLabelRow(ctx.db, ownerId, provider, label);
    if (existing !== undefined) {
      await rotateSealed(ctx.db, { credentialId: existing.id, sealed, metadata, now });
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
        // The raw libSQL error is NOT chained beyond `.cause` (it carries SQL internals); the typed
        // conflict is the honest client signal — the winner's insert succeeded, so "already exists".
        const conflict = new CredentialsConflictError(
          `A ${provider} credential already exists for this slot — refresh and retry.`,
        );
        conflict.cause = err;
        throw conflict;
      }
      throw err;
    }
    return reloadView(ctx, ownerId, id);
  };
}

/** Reload + project a row we just wrote (it always exists under that id); narrows the owner-scoped read. */
async function reloadView(
  ctx: CredentialContext,
  ownerId: UserId,
  id: UserCredentialId,
): Promise<CredentialView> {
  const row = await fetchOwnedCredential(ctx.db, ownerId, id);
  if (row === undefined) {
    throw new DomainOperationError(
      CREDENTIALS_OP_CODES.notFound,
      `credential ${id} vanished immediately after write`,
    );
  }
  return toCredentialView(row);
}
