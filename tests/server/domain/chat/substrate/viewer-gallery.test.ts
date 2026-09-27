// `resolveViewerGalleryCharacterId` — the room's first character seat, gated on the viewer owning it. The
// roster order and the owner-scoped read are the two inputs; each test varies one and pins the answer.

import type { ParticipantKind } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveViewerGalleryCharacterId } from "../../../../../packages/server/src/domain/chat/substrate/viewer-gallery.ts";
import { makeCharacter } from "../../../../support/factories/character.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const host = castId<UserId>("user_gallery_host");
const guest = castId<UserId>("user_gallery_guest");
const aria = castId<CharacterId>("character_gallery_aria");
const kai = castId<CharacterId>("character_gallery_kai");

interface Seat {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}

const humanSeat = (userId: UserId): Seat => ({ kind: "human", userId, characterId: null });
const characterSeat = (characterId: CharacterId): Seat => ({ kind: "character", userId: null, characterId });

type GetCard = Parameters<typeof resolveViewerGalleryCharacterId>[0];

/** An owner-scoped `getCard` over a fixed ownership table, recording every ask. */
function ownershipRead(owned: ReadonlyMap<CharacterId, UserId>): {
  readonly getCard: GetCard;
  readonly asks: { ownerId: UserId; characterId: CharacterId }[];
} {
  const asks: { ownerId: UserId; characterId: CharacterId }[] = [];
  return {
    asks,
    getCard: ({ ownerId, characterId }): ReturnType<GetCard> => {
      asks.push({ ownerId, characterId });
      return Promise.resolve(owned.get(characterId) === ownerId ? makeCharacter({ id: characterId, ownerId }) : null);
    },
  };
}

const HOST_OWNS_BOTH = new Map([
  [aria, host],
  [kai, host],
]);

test("the first character seat in roster order, when the viewer owns it", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  const roster = [humanSeat(host), characterSeat(aria), characterSeat(kai)];
  expect(await resolveViewerGalleryCharacterId(read.getCard, roster, host)).toBe(aria);
  // The ownership question is the viewer's own, about the one character the pick names.
  expect(read.asks).toEqual([{ ownerId: host, characterId: aria }]);
});

test("the roster order decides the pick, not the id order", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  expect(await resolveViewerGalleryCharacterId(read.getCard, [humanSeat(host), characterSeat(kai), characterSeat(aria)], host)).toBe(kai);
});

test("null for a viewer who does not own the room's character", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  const roster = [humanSeat(host), humanSeat(guest), characterSeat(aria)];
  expect(await resolveViewerGalleryCharacterId(read.getCard, roster, guest)).toBeNull();
  expect(read.asks).toEqual([{ ownerId: guest, characterId: aria }]);
});

test("null, and no ownership read, in a room with no character seat", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  expect(await resolveViewerGalleryCharacterId(read.getCard, [humanSeat(host), humanSeat(guest)], host)).toBeNull();
  expect(read.asks).toEqual([]);
});
