// The roster-avatar reference check assets consumes (`AssetsContext.loadCoParticipantOwner`), not a hash→any-owner
// oracle. It returns an owner only if `hash` is the avatar of (a) a character presently rostered in a room the
// caller is present in, or (b) a persona a present human seat holds active in such a room, or (c) an asset a
// `message_assets` row links into a room where both the caller and the owner are present. The owner it returns is
// `assets.ownerId`, the CAS partition holding the bytes. The arms run in that order and stop at the first answer.

import type { AssetsContext } from "#domain/assets";
import type { ChatContext } from "../context.ts";
import { loadRosteredCharacterAvatarOwner, loadSeatedPersonaAvatarOwner, loadSharedAttachmentOwner } from "../persistence/co-participant-assets.ts";

export function createLoadCoParticipantOwner(ctx: Pick<ChatContext, "db">): NonNullable<AssetsContext["loadCoParticipantOwner"]> {
  return async (callerId, hash) =>
    (await loadRosteredCharacterAvatarOwner(ctx.db, callerId, hash)) ??
    (await loadSeatedPersonaAvatarOwner(ctx.db, callerId, hash)) ??
    (await loadSharedAttachmentOwner(ctx.db, callerId, hash));
}
