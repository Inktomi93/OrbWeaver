// `viewerGalleryCharacter` — the one read every gallery door uses: `ChatDetail.viewerGalleryCharacterId`
// resolved to its roster seat, or `null` when the server named no gallery character for this viewer.

import type { ParticipantView } from "@orb/contracts/chat";
import { viewerGalleryCharacter } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = mintTypeId(ID_PREFIX.chat);

function characterSeat(characterId: CharacterId, displayName: string): ParticipantView {
  return {
    id: mintTypeId(ID_PREFIX.chatParticipant),
    chatId: CHAT_ID,
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 0.5,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName,
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
  };
}

const aria = mintTypeId(ID_PREFIX.character);
const kai = mintTypeId(ID_PREFIX.character);
const participants = [characterSeat(aria, "Aria"), characterSeat(kai, "Kai")];

test("the named gallery character resolves to its own seat, not the roster's first", () => {
  expect(viewerGalleryCharacter({ viewerGalleryCharacterId: kai, participants })?.displayName).toBe("Kai");
});

test("no named gallery character is no seat", () => {
  expect(viewerGalleryCharacter({ viewerGalleryCharacterId: null, participants })).toBeNull();
});

test("a named character with no seat in the roster is no seat", () => {
  expect(viewerGalleryCharacter({ viewerGalleryCharacterId: mintTypeId(ID_PREFIX.character), participants })).toBeNull();
});
