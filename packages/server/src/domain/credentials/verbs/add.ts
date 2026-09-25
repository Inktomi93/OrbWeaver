// verb: add — seal and insert a NEW credential; it never overwrites one, so a taken label (the implicit
// "default" too) gets the next free spelling and `replace` is the only way a stored secret changes. The
// provider is checked against the registry before sealing: its id is half the AAD.

import type { Db } from "@orb/db";
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

type SlotRow = Omit<Parameters<typeof insertSealed>[1], "label">;

async function insertAtFreeLabel(db: Db, row: SlotRow, wanted: string): Promise<string> {
  const label = nextFreeLabel(wanted, await listProviderLabels(db, row.ownerId, row.provider));
  await insertSealed(db, { ...row, label });
  return label;
}

// Two adds can both read a label as free; the slot's unique index refuses the later insert, and one re-read of
// the owner's labels names the next free one. A second collision is a conflict the caller retries.
async function insertInFreeSlot(db: Db, row: SlotRow, wanted: string): Promise<string> {
  // @orb-waive caught-failure-ownership(err): a unique collision is the expected loser of a concurrent add; the retry below re-reads the free labels, and a second collision surfaces as CredentialsConflictError with its cause. Ends if the slot index or the retry goes.
  try {
    return await insertAtFreeLabel(db, row, wanted);
  } catch (err) {
    if (isConstraintViolation(err)?.kind !== "unique") {
      throw err;
    }
  }
  try {
    return await insertAtFreeLabel(db, row, wanted);
  } catch (err) {
    if (isConstraintViolation(err)?.kind === "unique") {
      const conflict = new CredentialsConflictError(`A ${row.provider} credential already exists for this slot — refresh and retry.`);
      conflict.cause = err;
      throw conflict;
    }
    throw err;
  }
}

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
    const metadata = params.metadata ?? null;
    const sealed = ctx.box.encrypt(params.key.trim(), aadFor(ownerId, provider));
    const now = ctx.now();

    const id = ctx.newCredentialId();
    const label = await insertInFreeSlot(ctx.db, { id, ownerId, provider, sealed, metadata, now }, wanted);
    await ctx.audit({ actorUserId: ownerId, action: "credential.add", entityType: "credential", entityId: id, metadata: { provider, label } }, now);
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId: id });
    return reloadView(ctx, ownerId, id);
  };
}
