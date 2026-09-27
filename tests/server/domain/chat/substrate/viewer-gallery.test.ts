// `resolveViewerOwnedCharacterIds` and `viewerGalleryCharacterIdOf` — the viewer's owned character seats, and
// the room's gallery subject derived from them. The roster order and the owner-scoped read are the two inputs;
// each test varies one and pins the answer.

import type { ParticipantKind } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveViewerOwnedCharacterIds, viewerGalleryCharacterIdOf } from "../../../../../packages/server/src/domain/chat/substrate/viewer-gallery.ts";
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

type GetCard = Parameters<typeof resolveViewerOwnedCharacterIds>[0];

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

const MIXED_OWNERS = new Map([
  [aria, host],
  [kai, guest],
]);

test("the owner's set is every character seat they own, in roster order, one ownership read per seat", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  const roster = [humanSeat(host), characterSeat(kai), characterSeat(aria)];
  expect(await resolveViewerOwnedCharacterIds(read.getCard, roster, host)).toEqual([kai, aria]);
  expect(read.asks).toEqual([
    { ownerId: host, characterId: kai },
    { ownerId: host, characterId: aria },
  ]);
});

test("a guest who owns no character here has an empty set", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  const roster = [humanSeat(host), humanSeat(guest), characterSeat(aria), characterSeat(kai)];
  expect(await resolveViewerOwnedCharacterIds(read.getCard, roster, guest)).toEqual([]);
});

test("in a group room with mixed owners, each viewer's set holds only their own characters", async () => {
  const read = ownershipRead(MIXED_OWNERS);
  const roster = [humanSeat(host), humanSeat(guest), characterSeat(aria), characterSeat(kai)];
  expect(await resolveViewerOwnedCharacterIds(read.getCard, roster, host)).toEqual([aria]);
  expect(await resolveViewerOwnedCharacterIds(read.getCard, roster, guest)).toEqual([kai]);
});

test("an empty set, and no ownership read, in a room with no character seat", async () => {
  const read = ownershipRead(HOST_OWNS_BOTH);
  expect(await resolveViewerOwnedCharacterIds(read.getCard, [humanSeat(host), humanSeat(guest)], host)).toEqual([]);
  expect(read.asks).toEqual([]);
});

test("the gallery subject is the first character seat in roster order, when the viewer owns it", () => {
  expect(viewerGalleryCharacterIdOf([humanSeat(host), characterSeat(aria), characterSeat(kai)], [aria, kai])).toBe(aria);
  expect(viewerGalleryCharacterIdOf([humanSeat(host), characterSeat(kai), characterSeat(aria)], [aria, kai])).toBe(kai);
});

test("no gallery subject when the viewer does not own the first seat, even if they own a later one", () => {
  // A chat-generated picture joins the first seat's gallery; a later owned seat is never where it lands.
  expect(viewerGalleryCharacterIdOf([humanSeat(guest), characterSeat(aria), characterSeat(kai)], [kai])).toBeNull();
});

test("no gallery subject in a room with no character seat", () => {
  expect(viewerGalleryCharacterIdOf([humanSeat(host)], [])).toBeNull();
});
