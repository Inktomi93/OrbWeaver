// Unit: the chats-pane FACES curation (Arm B, §5.2). The strip is a shortcut, so what it must never do is
// mislead: no duplicate face, no face for a character we can't name, and an ORDER that actually means
// "who you were just with" (first appearance walking the server's newest-first chats), capped.

import { recentFaces } from "../../../../../packages/client/src/features/chat/lib/recent-faces";
import { expect, test } from "../../../../support/fixtures";

const SEATS = new Map([
  ["char_azarael", { name: "Azarael", hash: "hash_azarael" }],
  ["char_sera", { name: "Sera", hash: null }],
  ["char_niko", { name: "Niko", hash: null }],
]);

/** Chats arrive in the server's recency order, so index 0 is the newest. */
function chat(...seats: readonly string[]): { readonly participantCharacterIds: readonly string[] } {
  return { participantCharacterIds: seats };
}

test("faces are distinct, in FIRST-APPEARANCE order over the newest-first chats", () => {
  const faces = recentFaces([chat("char_sera"), chat("char_azarael", "char_sera"), chat("char_niko")], SEATS);
  expect(faces.map((face) => face.id)).toEqual(["char_sera", "char_azarael", "char_niko"]);
});

test("a character seen in several chats appears ONCE, at its most recent position", () => {
  const faces = recentFaces([chat("char_niko"), chat("char_niko"), chat("char_sera")], SEATS);
  expect(faces.map((face) => face.id)).toEqual(["char_niko", "char_sera"]);
});

test("an unresolvable seat is dropped — a face with no name is a shortcut to an unknown", () => {
  const faces = recentFaces([chat("char_departed", "char_sera")], SEATS);
  expect(faces.map((face) => face.id)).toEqual(["char_sera"]);
});

test("the cap bounds the run when a caller has one", () => {
  const faces = recentFaces([chat("char_azarael", "char_sera", "char_niko")], SEATS, 2);
  expect(faces.map((face) => face.id)).toEqual(["char_azarael", "char_sera"]);
});

// FACEFILT: the curation used to cap at 8 "to stay one glanceable row" — a count that knew nothing about
// the pane, and produced a sideways-scrolling strip on a six-character library. The STRIP measures its own
// width now, so the curation hands over everyone and lets the fold decide.
test("uncapped by default — every chatted character is offered, and the strip's own fold picks what shows", () => {
  const seats = new Map(Array.from({ length: 20 }, (_unused, index) => [`char_${index}`, { name: `Face ${index}`, hash: null }] as const));
  const chats = Array.from({ length: 20 }, (_unused, index) => chat(`char_${index}`));
  expect(recentFaces(chats, seats)).toHaveLength(20);
});

test("each face carries what the strip draws it with (the FaceStrip item shape, no adapter)", () => {
  expect(recentFaces([chat("char_azarael")], SEATS)).toEqual([{ id: "char_azarael", name: "Azarael", avatarHash: "hash_azarael" }]);
});

test("no chats (or no resolvable seats at all) yields an empty strip, never a shell", () => {
  expect(recentFaces([], SEATS)).toEqual([]);
  expect(recentFaces([chat()], SEATS)).toEqual([]);
});
