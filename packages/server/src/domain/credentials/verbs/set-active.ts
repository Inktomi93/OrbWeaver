// verb: setActive — promote a credential to active (ownership-scoped), atomically demoting any other
// active row in its `(owner, provider)` slot. The owner check is the `fetchOwnedCredential` → `requireOwned`
// load (a not-owned id collapses to `CredentialsNotFoundError`, HTTP 400 — no existence leak). Idempotent:
// re-activating the already-active row demotes-then-re-promotes the same row to the same state.

import type { SetActiveParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import type { CredentialView } from "../contract/views";
import { fetchOwnedCredential, promoteActive, toCredentialView } from "../persistence/queries";
import { requireOwned } from "../substrate/credential-not-found";

export function createSetActive(ctx: CredentialContext): CredentialsService["setActive"] {
  return async (params: SetActiveParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = requireOwned(
      await fetchOwnedCredential(ctx.db, ownerId, credentialId),
      credentialId,
    );
    await promoteActive(ctx.db, {
      ownerId,
      credentialId,
      provider: row.provider,
      now: ctx.now(),
    });
    const updated = requireOwned(
      await fetchOwnedCredential(ctx.db, ownerId, credentialId),
      credentialId,
    );
    return toCredentialView(updated);
  };
}
