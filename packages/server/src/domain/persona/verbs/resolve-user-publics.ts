// op: resolveUserPublics — a human's display surface in a room: the active persona's name and avatar when the
// user owns it, else the account handle, with the profile avatar as the last fallback. Principal-less and
// compose-built (the `resolvePersonasForParticipants` precedent); chat consumes it as an injected op.

import type { ResolveUserPublicsOp } from "@orb/contracts/persona";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId } from "@orb/kit/ids";
import type { UserPublicsDeps } from "../contract/ops.ts";
import type { PersonaContext } from "../contract/service.ts";
import { loadOwnedPersonaPublic } from "../persistence/queries.ts";

export function createResolveUserPublics(input: DbAssemblyInput<Pick<PersonaContext, "db">>, deps: UserPublicsDeps): ResolveUserPublicsOp {
  const ctx: Pick<PersonaContext, "db"> = { ...input, db: databaseForOwner(input.db) };
  return async (userId, personaId) => {
    const handle = await deps.loadUserHandle(userId);
    const persona = personaId === null ? undefined : await loadOwnedPersonaPublic(ctx.db, userId, personaId);
    let avatarAssetId: AssetId | null = persona?.avatarAssetId ?? null;
    if (avatarAssetId === null) {
      avatarAssetId = (await deps.loadUserSettings(userId)).profile.avatarAssetId ?? null;
    }
    return { displayName: persona?.name ?? handle, handle, avatarAssetId };
  };
}
