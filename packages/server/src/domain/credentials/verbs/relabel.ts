// verb: relabel — a key follows its connection's rename. Only a key still carrying the old connection name moves,
// so a name the user gave the key by hand is never overwritten; a taken name gets the next free spelling.

import { nextFreeLabel } from "@orb/kit/strings";
import type { CredentialContext } from "../context.ts";
import type { RelabelCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { fetchOwnedCredential, listProviderLabels, setLabelOwned } from "../persistence/queries.ts";

export function createRelabel(ctx: CredentialContext): CredentialsService["relabel"] {
  return async (params: RelabelCredentialParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = await fetchOwnedCredential(ctx.db, ownerId, credentialId);
    if (row?.label !== params.from) {
      return;
    }
    const taken = (await listProviderLabels(ctx.db, ownerId, row.provider)).filter((held) => held !== params.from);
    const label = nextFreeLabel(params.to, taken);
    const now = ctx.now();
    await setLabelOwned(ctx.db, { ownerId, credentialId, label, now });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "credential.relabel",
        entityType: "credential",
        entityId: credentialId,
        metadata: { provider: row.provider, from: params.from, to: label },
      },
      now,
    );
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
