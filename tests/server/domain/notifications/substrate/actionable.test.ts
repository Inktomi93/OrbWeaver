// The PURE half of `InboxView.actionable` (#1799): which notification types carry a decision, what a page
// asks the chat domain about, and how a resolved standing-set becomes the stamped view. Pure, so no db.
//
// WHY THESE ARE THE ASSERTIONS. The failure this module exists to prevent is not arithmetic — it is a NEW
// notification member shipping as informational and silently never raising the bell's dot, and a page
// paying a cross-domain round trip for rows that name nothing. So the pins are: the axis is exhaustive and
// says the right thing per member; the ask is DEDUPED and covers exactly the two chat-shaped members; a
// page that asks nothing is recognised as such; and an id the chat domain did NOT return comes back false
// (a settled invite whose row is still in the inbox — the #1501 shape).

import type { InboxView, NotificationEvent } from "@orb/contracts/notifications";
import type { ChatId, ChatInviteId, NotificationId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  asksNothing,
  asRaised,
  asSettled,
  NO_STANDING_ASKS,
  standingAsksOf,
  withActionable,
} from "../../../../../packages/server/src/domain/notifications/substrate/actionable.ts";

const RECIPIENT = castId<UserId>("user_reader");
const INVITE_A = castId<ChatInviteId>("chatinvite_a");
const INVITE_B = castId<ChatInviteId>("chatinvite_b");
const CHAT_A = castId<ChatId>("chat_a");

/** One stored row, minus the field under test. `seq` doubles as the id suffix so a failure names the row. */
function row(seq: number, payload: NotificationEvent): Omit<InboxView, "actionable"> {
  return {
    id: castId<NotificationId>(`notification_${seq}`),
    type: payload.type,
    payload,
    seq,
    readAt: null,
    dismissedAt: null,
    createdAt: 0,
  };
}

const inviteRow = (seq: number, inviteId: ChatInviteId): Omit<InboxView, "actionable"> =>
  row(seq, { type: "invite", recipientUserId: RECIPIENT, chatId: CHAT_A, inviteId, invitedByHandle: castId("host") });
const nominationRow = (seq: number, chatId: ChatId): Omit<InboxView, "actionable"> =>
  row(seq, { type: "handoff-nominated", recipientUserId: RECIPIENT, chatId, offer: { characters: 0, worldBooks: 0, regexScripts: 0, gmPreset: false } });
const consentRow = (seq: number): Omit<InboxView, "actionable"> => row(seq, { type: "plugins-awaiting-consent", recipientUserId: RECIPIENT, pendingCount: 9 });
const kickedRow = (seq: number): Omit<InboxView, "actionable"> => row(seq, { type: "kicked", recipientUserId: RECIPIENT, chatId: CHAT_A });

describe("standingAsksOf — what a page asks the chat domain", () => {
  test("names the invite and nomination ids, deduped, and nothing else", () => {
    const asks = standingAsksOf(
      [inviteRow(1, INVITE_A), inviteRow(2, INVITE_A), inviteRow(3, INVITE_B), nominationRow(4, CHAT_A), consentRow(5), kickedRow(6)],
      RECIPIENT,
    );
    expect(asks.recipientUserId).toBe(RECIPIENT);
    expect([...asks.inviteIds].sort()).toEqual([INVITE_A, INVITE_B]);
    expect(asks.nominatedChatIds).toEqual([CHAT_A]);
  });

  test("a page of consent + informational rows asks NOTHING — no round trip is owed", () => {
    // The common case, and the reason `asksNothing` exists: the standing consent ask is self-evident from
    // its own presence (its producer retracts it), so a fresh boot's inbox costs zero cross-domain reads.
    const asks = standingAsksOf([consentRow(1), kickedRow(2)], RECIPIENT);
    expect(asksNothing(asks)).toBe(true);
    expect(asksNothing(standingAsksOf([inviteRow(1, INVITE_A)], RECIPIENT))).toBe(false);
  });
});

describe("withActionable — the stamp", () => {
  test("a decision the chat domain still holds open is actionable; one it does not is NOT", () => {
    // The #1501 shape, and the whole reason this is a server read: BOTH rows are still in the inbox and
    // look identical to a client. Only `INVITE_A` is still open.
    const stamped = withActionable([inviteRow(1, INVITE_A), inviteRow(2, INVITE_B)], { inviteIds: [INVITE_A], nominatedChatIds: [] });
    expect(stamped.map((r) => r.actionable)).toEqual([true, false]);
  });

  test("a nomination follows its chat; an informational row is never actionable", () => {
    const stamped = withActionable([nominationRow(1, CHAT_A), kickedRow(2)], { inviteIds: [], nominatedChatIds: [CHAT_A] });
    expect(stamped.map((r) => r.actionable)).toEqual([true, false]);
    expect(withActionable([nominationRow(1, CHAT_A)], NO_STANDING_ASKS)[0]?.actionable).toBe(false);
  });

  test("the standing consent ask is actionable on its own presence — no id, no lookup", () => {
    expect(withActionable([consentRow(1)], NO_STANDING_ASKS)[0]?.actionable).toBe(true);
  });

  test("every other field rides through untouched", () => {
    const source = inviteRow(7, INVITE_A);
    const [stamped] = withActionable([source], { inviteIds: [INVITE_A], nominatedChatIds: [] });
    expect(stamped).toEqual({ ...source, actionable: true });
  });
});

describe("the write-time stamps", () => {
  test("a freshly RAISED decision-carrying row is standing; a raised notice is not", () => {
    // `record`'s value, which is also what the bus publishes — a live invite raises the dot on arrival.
    expect(asRaised(inviteRow(1, INVITE_A)).actionable).toBe(true);
    expect(asRaised(nominationRow(2, CHAT_A)).actionable).toBe(true);
    expect(asRaised(consentRow(3)).actionable).toBe(true);
    expect(asRaised(kickedRow(4)).actionable).toBe(false);
  });

  test("a row that has LEFT the inbox is settled, whatever it used to ask", () => {
    expect(asSettled(inviteRow(1, INVITE_A)).actionable).toBe(false);
    expect(asSettled(consentRow(2)).actionable).toBe(false);
  });
});
