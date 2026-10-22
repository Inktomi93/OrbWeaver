// domain/credentials/substrate/stored — the two steps every verb that WRITES a secret shares: refuse when the
// deployment cannot keep a key at all, and read the written row back as its secret-free view.

import type { CredentialView } from "@orb/contracts/credentials";
import { DomainOperationError } from "@orb/kit/errors";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES } from "../contract/errors.ts";
import type { CredentialContext } from "../contract/service.ts";
import { fetchOwnedCredential, toCredentialView } from "../persistence/queries.ts";

/** Refuse before anything is read or sealed when no CREDENTIALS_KEY is configured. */
export function requireStorage(ctx: CredentialContext): void {
  if (!ctx.box.enabled) {
    throw new DomainOperationError(CREDENTIALS_OP_CODES.disabled, "Per-user credential storage is disabled (no CREDENTIALS_KEY configured).");
  }
}

/** The row just written, as the wire view. */
export async function reloadView(ctx: CredentialContext, ownerId: UserId, id: UserCredentialId): Promise<CredentialView> {
  const row = await fetchOwnedCredential(ctx.db, ownerId, id);
  if (row === undefined) {
    throw new DomainOperationError(CREDENTIALS_OP_CODES.notFound, `credential ${id} vanished immediately after write`);
  }
  return toCredentialView(row);
}
