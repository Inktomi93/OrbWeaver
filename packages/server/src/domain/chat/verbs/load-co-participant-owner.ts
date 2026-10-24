// The co-participant reference check behind `AssetsContext.loadCoParticipantOwner`, never a hash→owner oracle: the
// asset's owner (its CAS partition) only if `hash` is a rostered character's avatar, a present seat's active persona
// avatar, or a room-linked attachment at or above the caller's floor, in a shared room; first match in that order.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetsContext } from "#domain/assets";
import type { ChatContext } from "../contract/context.ts";
import { loadRosteredCharacterAvatarOwner, loadSeatedPersonaAvatarOwner, loadSharedAttachmentOwner } from "../persistence/co-participant-assets.ts";

export function createLoadCoParticipantOwner(input: DbAssemblyInput<Pick<ChatContext, "db">>): NonNullable<AssetsContext["loadCoParticipantOwner"]> {
  const ctx = { db: databaseForOwner(input.db) };
  return async (callerId, hash) =>
    (await loadRosteredCharacterAvatarOwner(ctx.db, callerId, hash)) ??
    (await loadSeatedPersonaAvatarOwner(ctx.db, callerId, hash)) ??
    (await loadSharedAttachmentOwner(ctx.db, callerId, hash));
}
