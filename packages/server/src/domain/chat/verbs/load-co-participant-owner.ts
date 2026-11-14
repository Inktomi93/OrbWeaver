// The co-participant reference check behind `AssetsContext.loadCoParticipantOwner`, never a hash→owner oracle: the
// asset's owner (its CAS partition) only if `hash` is a rostered character's avatar, a present seat's active persona
// avatar, the room pin's persona avatar, or a room-linked attachment at or above the caller's floor, in a room the
// caller is present in; first match in that order. Every arm but the pin's needs the owner present in that room and in
// its consent set, so a disabled owner's art stops serving like a departed owner's. The pin's avatar serves while the
// pin holds (D315).
//
// Chat reads only its own tables. Assets names the rows holding `hash`, and character and persona name the avatars of
// the ids chat's own room read found, so no owner read answers for a card or persona outside the caller's rooms. The
// match between an avatar and the hash is made here, against the holders. Nothing takes a first row: a hash can sit
// under several owners (CAS dedup is per owner), and a first row whose owner is out of the consent set must not hide a
// later one that is in it.

import type { LoadCoParticipantOwnerOp } from "@orb/contracts/assets";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { RoomArtReads } from "../contract/room-art-reads.ts";
import type { CallerRoomSeat } from "../persistence/co-participant-assets.ts";
import { loadCallerRoomSeats, loadVisibleAssetLinksInCallerRooms } from "../persistence/co-participant-assets.ts";
import { keepConsentingOwners } from "../substrate/participants-humans.ts";

type Ctx = Pick<ChatContext, "db" | "resolveUserEnabled"> & Pick<RoomArtReads, "loadHashHolders" | "loadCharacterAvatars" | "loadPersonaAvatars">;

/** A reference into `chatId` whose asset belongs to `ownerId`, beside the owner's present seat there. */
interface OwnerCandidate {
  readonly chatId: ChatId;
  readonly ownerId: UserId;
  readonly ownerSeat: CallerRoomSeat;
}

/** A persona a seat or a pin puts into a room. */
interface RoomPersona {
  readonly chatId: ChatId;
  readonly personaId: PersonaId;
}

async function firstConsentingOwner(ctx: Ctx, candidates: readonly OwnerCandidate[]): Promise<UserId | undefined> {
  return (await keepConsentingOwners(ctx, candidates))[0]?.ownerId;
}

function presentHumanSeats(seats: readonly CallerRoomSeat[]): ReadonlyMap<ChatId, ReadonlyMap<UserId, CallerRoomSeat>> {
  const byRoom = new Map<ChatId, Map<UserId, CallerRoomSeat>>();
  for (const seat of seats) {
    if (seat.userId !== null) {
      byRoom.getOrInsertComputed(seat.chatId, () => new Map()).set(seat.userId, seat);
    }
  }
  return byRoom;
}

export function createLoadCoParticipantOwner(input: DbAssemblyInput<Ctx>): LoadCoParticipantOwnerOp {
  const ctx: Ctx = { ...input, db: databaseForOwner(input.db) };
  return async (callerId, hash) => {
    const holders = await ctx.loadHashHolders(hash);
    if (holders.size === 0) {
      return;
    }
    // Every arm needs a room where the caller is present, the link arm included, so no room means no reference.
    const seats = await loadCallerRoomSeats(ctx.db, callerId);
    if (seats.length === 0) {
      return;
    }
    const ownerSeats = presentHumanSeats(seats);
    // The owner of the asset when it holds `hash` and that owner is present in the room the reference sits in.
    const candidateIn = (chatId: ChatId, assetId: AssetId | undefined): OwnerCandidate[] => {
      const ownerId = assetId === undefined ? undefined : holders.get(assetId);
      const ownerSeat = ownerId === undefined ? undefined : ownerSeats.get(chatId)?.get(ownerId);
      return ownerId === undefined || ownerSeat === undefined ? [] : [{ chatId, ownerId, ownerSeat }];
    };

    const rostered = seats.flatMap((seat) =>
      seat.kind === "character" && seat.characterId !== null ? [{ chatId: seat.chatId, characterId: seat.characterId }] : [],
    );
    const characterAvatars = await ctx.loadCharacterAvatars([...new Set(rostered.map((seat) => seat.characterId))]);
    const rosterOwner = await firstConsentingOwner(
      ctx,
      rostered.flatMap((seat) => candidateIn(seat.chatId, characterAvatars.get(seat.characterId))),
    );
    if (rosterOwner !== undefined) {
      return rosterOwner;
    }

    const worn: RoomPersona[] = seats.flatMap((seat) =>
      seat.kind === "human" && seat.activePersonaId !== null ? [{ chatId: seat.chatId, personaId: seat.activePersonaId }] : [],
    );
    // Each room's pin, read off the room row every seat carries, so a room appears once.
    const pins: RoomPersona[] = [
      ...new Map(seats.flatMap((seat) => (seat.anchorPersonaId === null ? [] : [[seat.chatId, seat.anchorPersonaId] as const]))),
    ].map(([chatId, personaId]) => ({ chatId, personaId }));
    const personaAvatars = await ctx.loadPersonaAvatars([...new Set([...worn, ...pins].map((persona) => persona.personaId))]);
    const wornOwner = await firstConsentingOwner(
      ctx,
      worn.flatMap((persona) => candidateIn(persona.chatId, personaAvatars.get(persona.personaId))),
    );
    if (wornOwner !== undefined) {
      return wornOwner;
    }
    // The pin holds past its owner's presence and consent (D315), so this arm takes the asset's owner with no seat.
    const pinOwner = pins.flatMap((pin) => {
      const assetId = personaAvatars.get(pin.personaId);
      const ownerId = assetId === undefined ? undefined : holders.get(assetId);
      return ownerId === undefined ? [] : [ownerId];
    })[0];
    if (pinOwner !== undefined) {
      return pinOwner;
    }

    const links = await loadVisibleAssetLinksInCallerRooms(ctx.db, callerId, [...holders.keys()]);
    return firstConsentingOwner(
      ctx,
      links.flatMap((link) => candidateIn(link.chatId, link.assetId)),
    );
  };
}
