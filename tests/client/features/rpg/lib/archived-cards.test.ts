// Unit: the transcript→card projection the Scene "Cards" archive and the Journal chronicle share. The
// load-bearing fact is PER-ROW PROVENANCE: each card carries the render policy of the message it was
// archived from (resolved through the ONE trust authority, `lib/render-trust`), so the archive can never
// paint an external image the transcript blocked one panel away. Fail-CLOSED while the roster is loading.

import type { ParticipantView } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { collectArchivedCards } from "../../../../../packages/client/src/features/rpg/lib/archived-cards";
import { expect, test } from "../../../../support/fixtures";

const VIEWER = castId<UserId>("user_viewer");
const TRUSTING = castId<CharacterId>("char_trusting");
const STRICT = castId<CharacterId>("char_strict");

function character(characterId: CharacterId, forbidExternalMedia: boolean): ParticipantView {
  return {
    id: castId("participant_1"),
    chatId: castId("chat_1"),
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 1,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "Speaker",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy: { trustHtml: false, forbidExternalMedia },
  };
}

const CARD_BODY = ':::card title="A sealed letter"\n<p>Read me</p>\n:::';

/** DERIVED from the projection's own parameter — a hand-spelled row shape here would rot silently. */
type CardSourceRow = Parameters<typeof collectArchivedCards>[0][number];

function message(id: string, characterId: CharacterId): CardSourceRow {
  return { id, content: CARD_BODY, createdAt: 1_700_000_000_000, role: "assistant" as const, authorUserId: null, characterId };
}

const ROSTER = [character(TRUSTING, false), character(STRICT, true)];

test("each card carries ITS OWN author's external-media verdict, not one blanket verdict for the surface", () => {
  const cards = collectArchivedCards([message("msg_1", TRUSTING), message("msg_2", STRICT)], { participants: ROSTER, viewerUserId: VIEWER });

  expect(cards.map((c) => [c.messageId, c.allowExternalMedia])).toEqual([
    ["msg_1", true],
    ["msg_2", false],
  ]);
});

test("FAIL-CLOSED: an unresolvable author (roster still loading) archives the card with media blocked", () => {
  const [card] = collectArchivedCards([message("msg_1", TRUSTING)], { participants: undefined, viewerUserId: VIEWER });

  expect(card?.allowExternalMedia).toBe(false);
});

test("the viewer's OWN card obeys the safe floor too — a user row names no character to opt in", () => {
  const own = { id: "msg_1", content: CARD_BODY, createdAt: 0, role: "user" as const, authorUserId: VIEWER, characterId: null };
  const [card] = collectArchivedCards([own], { participants: ROSTER, viewerUserId: VIEWER });

  expect(card?.allowExternalMedia).toBe(false);
});
