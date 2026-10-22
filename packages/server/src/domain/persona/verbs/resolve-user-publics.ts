// op: resolveUserPublics — a human's display surface in a room: the active persona's name and avatar when the
// user owns it, else the account handle, with the profile avatar as the last fallback. Principal-less and
// compose-built (the `resolvePersonasForParticipants` precedent); chat consumes it as an injected op.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext } from "#domain/chat";
import type { UserPublicsDeps } from "../contract/ops.ts";
import type { PersonaContext } from "../contract/service.ts";
import { loadOwnedPersonaPublic } from "../persistence/queries.ts";

export function createResolveUserPublics(input: DbAssemblyInput<Pick<PersonaContext, "db">>, deps: UserPublicsDeps): ChatContext["resolveUserPublics"] {
  const ctx: Pick<PersonaContext, "db"> = { ...input, db: databaseForOwner(input.db) };
  return async (userId, personaId) => {
    const handle = await deps.loadUserHandle(userId);
    const persona = personaId === null ? undefined : await loadOwnedPersonaPublic(ctx.db, userId, personaId);
    let avatarAssetId: AssetId | null = persona?.avatarAssetId ?? null;
    if (avatarAssetId === null) {
      // optional-read-as-absent — a persona/handle
      // display fact was already resolved above; this is the LAST-resort avatar enrichment, and a failed
      // read just leaves `avatarAssetId` at its already-established `null`. Ends if this read becomes the
      // only source of `displayName`/`handle`.
      try {
        const raw = (await deps.loadUserSettings(userId)).profile.avatarAssetId ?? null;
        avatarAssetId = raw === null ? null : castId<AssetId>(raw);
      } catch {
        // The fallback stays absent.
      }
    }
    return { displayName: persona?.name ?? handle, handle, avatarAssetId };
  };
}
