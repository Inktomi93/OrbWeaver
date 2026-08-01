// The D18 projection predicate. The load-bearing semantics are the CONTRACT's, so they get pinned here:
// `ChatSummary.participantCharacterIds` includes DEPARTED character seats, so a room she has since left
// stays in her history; and the predicate must PRESERVE the caller's order (the server's newest-updated-first
// recency — the projection never re-sorts, D4). Both were the two ways a re-spelling could silently drift.

import { chatsWithCharacter } from "@orb/client/lib";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const AZARAEL = castId<CharacterId>("char_testazaraelaa");
const SERA = castId<CharacterId>("char_testseraaaaaa");
const NIKO = castId<CharacterId>("char_testnikoaaaaa");

/** A chat row reduced to what the predicate reads, plus an id so ordering is observable. */
function chat(id: string, seats: readonly CharacterId[]): { readonly id: string; readonly participantCharacterIds: readonly CharacterId[] } {
  return { id, participantCharacterIds: seats };
}

describe("chatsWithCharacter", () => {
  test("keeps only the chats whose character seats include the id", () => {
    const chats = [chat("solo", [AZARAEL]), chat("other", [SERA]), chat("group", [AZARAEL, SERA, NIKO])];
    expect(chatsWithCharacter(chats, AZARAEL).map((c) => c.id)).toEqual(["solo", "group"]);
  });

  test("a room she has since LEFT still counts — `participantCharacterIds` carries departed seats", () => {
    // The wire row for a chat whose PRESENT roster no longer seats her: the names line names the present
    // cast only, while the seat ids keep her (the contract's deliberate "every chat you've had with them").
    const departed = { ...chat("left", [AZARAEL, NIKO]), participantNames: ["Niko"] };
    expect(chatsWithCharacter([departed], AZARAEL)).toEqual([departed]);
  });

  test("preserves the caller's order (the server recency order — never re-sorted)", () => {
    const chats = [chat("newest", [AZARAEL]), chat("middle", [AZARAEL]), chat("oldest", [AZARAEL])];
    expect(chatsWithCharacter(chats, AZARAEL).map((c) => c.id)).toEqual(["newest", "middle", "oldest"]);
  });

  test("a character with no seats anywhere projects to an empty list (the empty-state input)", () => {
    expect(chatsWithCharacter([chat("solo", [SERA])], AZARAEL)).toEqual([]);
    expect(chatsWithCharacter([], AZARAEL)).toEqual([]);
  });

  test("a chat is counted ONCE even if the id appears twice in its seats", () => {
    const dupe = chat("dupe", [AZARAEL, AZARAEL]);
    expect(chatsWithCharacter([dupe], AZARAEL)).toHaveLength(1);
  });
});
