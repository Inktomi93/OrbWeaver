// The co-participant reference check behind `AssetsContext.loadCoParticipantOwner`, never a hash→owner oracle: the
// asset's owner (its CAS partition) only if `hash` is a rostered character's avatar, a present seat's active persona
// avatar, the room pin's persona avatar, or a room-linked attachment at or above the caller's floor, in a shared
// room; first match in that order. Every arm but the pin's needs the owner in that room's consent set, so a disabled
// owner's art stops serving like a departed owner's. The pin's avatar serves while the pin holds (ADR 0315).

import type { LoadCoParticipantOwnerOp } from "@orb/contracts/assets";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { CoParticipantOwnerCandidate } from "../persistence/co-participant-assets.ts";
import {
  loadPinnedPersonaAvatarOwner,
  loadRosteredCharacterAvatarOwners,
  loadSeatedPersonaAvatarOwners,
  loadSharedAttachmentOwners,
} from "../persistence/co-participant-assets.ts";
import { keepConsentingOwners } from "../substrate/participants-humans.ts";

type Ctx = Pick<ChatContext, "db" | "resolveUserEnabled">;

async function consentingOwner(ctx: Ctx, candidates: Promise<readonly CoParticipantOwnerCandidate[]>): Promise<UserId | undefined> {
  return (await keepConsentingOwners(ctx, await candidates))[0]?.ownerId;
}

export function createLoadCoParticipantOwner(input: DbAssemblyInput<Ctx>): LoadCoParticipantOwnerOp {
  const ctx: Ctx = { ...input, db: databaseForOwner(input.db) };
  return async (callerId, hash) =>
    (await consentingOwner(ctx, loadRosteredCharacterAvatarOwners(ctx.db, callerId, hash))) ??
    (await consentingOwner(ctx, loadSeatedPersonaAvatarOwners(ctx.db, callerId, hash))) ??
    (await loadPinnedPersonaAvatarOwner(ctx.db, callerId, hash)) ??
    (await consentingOwner(ctx, loadSharedAttachmentOwners(ctx.db, callerId, hash)));
}
