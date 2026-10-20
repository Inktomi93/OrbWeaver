// The `ChatDetail` projection's VIEWER-RELATIVE half — `viewerIsHost` specifically. It is a role
// PROJECTION (D106-F1: consumers thread the verdict as DATA), derived through its class home
// `member-visibility.ts::viewerHoldsHost`, and these are the pins that make the derivation observable:
// the host arm, the member arm, and the arm the roster `find` produces for a viewer who is not on it at
// all (a non-member is NOT a host — the flag must never fall open when the lookup misses).

import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ParticipantData } from "#server/domain/chat/contract/views.ts";
import { toChatDetail } from "#server/domain/chat/substrate/chat-detail.ts";
import { makeLoadParticipantViews, seedChat, seedParticipant, seedUser } from "../_support.ts";

// The roster is the production seat read over a seeded room: a host and a member, their roles captured from rows.
const db = await freshDb();
const hostId = await seedUser(db, castId<Handle>("host"));
const memberId = await seedUser(db, castId<Handle>("member"));
const strangerId = castId<UserId>("user_stranger");
const chatId = await seedChat(db, "detail_1");
await seedParticipant(db, { chatId, key: "host", userId: hostId, role: "host" });
await seedParticipant(db, { chatId, key: "member", userId: memberId, role: "member" });

// The stored row half, byte-complete: it is small, and a partial cast here would be fabricating the very
// shape the projection copies through.
const ROW = {
  id: chatId,
  title: "A room",
  starred: false,
  archived: false,
  temporary: false,
  parentChatId: null,
  forkedAt: null,
  anchorPersonaId: null,
  pendingHostUserId: null,
  compactSummary: null,
  compactedAtSeq: null,
  metadata: {},
  createdAt: 1,
  updatedAt: 2,
} as const;

function detailFor(viewerUserId: UserId, participants: readonly ParticipantData[]): ReturnType<typeof toChatDetail> {
  return toChatDetail({
    chat: ROW,
    participants,
    identities: [],
    viewerUserId,
    viewerHistoryFloorSeq: 0,
    viewerOwnedCharacterIds: [],
    anchorState: "none",
  });
}

const ROSTER = await makeLoadParticipantViews(db)(chatId);

test("viewerIsHost is TRUE for the roster's host", () => {
  expect(detailFor(hostId, ROSTER).viewerIsHost).toBe(true);
});

test("viewerIsHost is FALSE for a non-host member", () => {
  expect(detailFor(memberId, ROSTER).viewerIsHost).toBe(false);
});

test("viewerIsHost is FALSE when the viewer is not on the roster at all (the find misses — never fails open)", () => {
  expect(detailFor(strangerId, ROSTER).viewerIsHost).toBe(false);
  expect(detailFor(hostId, []).viewerIsHost).toBe(false);
});
