// The `ChatDetail` projection's VIEWER-RELATIVE half — `viewerIsHost` specifically. It is a role
// PROJECTION (D106-F1: consumers thread the verdict as DATA), derived through its class home
// `member-visibility.ts::viewerHoldsHost`, and these are the pins that make the derivation observable:
// the host arm, the member arm, and the arm the roster `find` produces for a viewer who is not on it at
// all (a non-member is NOT a host — the flag must never fall open when the lookup misses).

import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { toChatDetail } from "../../../../../packages/server/src/domain/chat/substrate/chat-detail.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const chatId = castId<ChatId>("chat_detail_1");
const hostId = castId<UserId>("user_host");
const memberId = castId<UserId>("user_member");
const strangerId = castId<UserId>("user_stranger");

// A deliberate minimal roster row — `toChatDetail`'s viewer resolution reads ONLY `userId` (the ⋈ key) and
// `role` (the projected bit); the other ~16 ParticipantView fields are irrelevant to what these tests pin,
// and a full factory would hide that the host flag depends on exactly those two.
function participant(userId: UserId, role: string): ParticipantView {
  // FABRICATION-OK: viewer-resolution probe reading userId + role only (see above).
  return { userId, role } as unknown as ParticipantView;
}

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

function detailFor(viewerUserId: UserId, participants: readonly ParticipantView[]): ReturnType<typeof toChatDetail> {
  return toChatDetail({
    chat: ROW,
    participants,
    cast: [],
    viewerUserId,
    viewerHistoryFloorSeq: 0,
  });
}

const ROSTER = [participant(hostId, "host"), participant(memberId, "member")];

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
