// Unit: the chats-pane FACES curation (Arm B, §5.2). The strip is a shortcut, so what it must never do is
// mislead: no duplicate face, and an ORDER that actually means "who you were just with" (first appearance
// walking the server's newest-first chats), capped.
//
// #192 retired the "unresolvable seat" arm along with the whole-library portrait map: the seats arrive ON
// the chat row (`ChatSummary.participantPortraits`), already named and already resolved by the roster read
// the list projection runs. A face the curation cannot name is no longer representable.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { FaceSourceChat } from "../../../../../packages/client/src/features/chat/lib/recent-faces.ts";
import { recentFaces } from "../../../../../packages/client/src/features/chat/lib/recent-faces.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function seat(id: string, name: string, avatarHash: string | null = null): FaceSourceChat["participantPortraits"][number] {
  return { characterId: castId<CharacterId>(id), name, avatarHash };
}

const SEATS = new Map([
  ["char_azarael", seat("char_azarael", "Azarael", "hash_azarael")],
  ["char_sera", seat("char_sera", "Sera")],
  ["char_niko", seat("char_niko", "Niko")],
]);

/** Chats arrive in the server's recency order, so index 0 is the newest. */
function chat(...seats: readonly string[]): FaceSourceChat {
  return { participantPortraits: seats.map((id) => SEATS.get(id) ?? seat(id, id)) };
}

test("faces are distinct, in FIRST-APPEARANCE order over the newest-first chats", () => {
  const faces = recentFaces([chat("char_sera"), chat("char_azarael", "char_sera"), chat("char_niko")]);
  expect(faces.map((face) => face.id)).toEqual(["char_sera", "char_azarael", "char_niko"]);
});

test("a character seen in several chats appears ONCE, at its most recent position", () => {
  const faces = recentFaces([chat("char_niko"), chat("char_niko"), chat("char_sera")]);
  expect(faces.map((face) => face.id)).toEqual(["char_niko", "char_sera"]);
});

test("the cap bounds the run when a caller has one", () => {
  const faces = recentFaces([chat("char_azarael", "char_sera", "char_niko")], 2);
  expect(faces.map((face) => face.id)).toEqual(["char_azarael", "char_sera"]);
});

// FACEFILT: the curation used to cap at 8 "to stay one glanceable row" — a count that knew nothing about
// the pane, and produced a sideways-scrolling strip on a six-character library. The STRIP measures its own
// width now, so the curation hands over everyone and lets the fold decide.
test("uncapped by default — every chatted character is offered, and the strip's own fold picks what shows", () => {
  const chats = Array.from({ length: 20 }, (_unused, index) => chat(`char_${index}`));
  expect(recentFaces(chats)).toHaveLength(20);
});

test("each face carries what the strip draws it with (the FaceStrip item shape, no adapter)", () => {
  expect(recentFaces([chat("char_azarael")])).toEqual([{ id: "char_azarael", name: "Azarael", avatarHash: "hash_azarael" }]);
});

test("no chats (or a room with no character seats at all) yields an empty strip, never a shell", () => {
  expect(recentFaces([])).toEqual([]);
  expect(recentFaces([chat()])).toEqual([]);
});
