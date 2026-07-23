// invites.requestAgentSeat + the agent-unseat via invites.kick — the P6 wire (D60,
// agent-principal-design/04 §3, doc 06 §3/§4). Drives the REAL composition root (the `app` fixture)
// end-to-end through the tRPC invites router (multiHumanProcedure — the fixture context is multi-human
// capable, so the B4 belt is OPEN and the real member/owner gates are what these exercise):
//   • the owner≠host CONSENT request lands a durable `agent-seat-requested` notification in the HOST's inbox
//     (a human recipient — the agent-recipient refusal never applies), advisory (no roster mutation);
//   • a non-member requester is a leak-free NOT_FOUND;
//   • `invites.kick` UNSEATS a seated agent WITHOUT throwing — the agent seat has no inbox, so kick stamps
//     leftSeq directly instead of coupling to a `kicked` notification (which notifications.record would
//     refuse, aborting the unseat). kick IS the agent per-room containment path.

import type { Db } from "@orb/db";
import { chatParticipants, chats, notifications } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { describe } from "vitest";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures";
import { FROZEN_AT, seedChat, seedParticipant } from "../../../domain/chat/_support";

// A chat with a REAL minted TypeID — the `agent-seat-requested` notification's `chatId` is validated by
// `typeIdSchema` (production ids are TypeIDs), so a cast `chat_<key>` id would be rejected at record time.
async function freshChat(db: Db): Promise<ChatId> {
  const id = mintTypeId(ID_PREFIX.chat);
  await db.insert(chats).values({ id, title: null, archived: false, temporary: false, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  return id;
}

describe("invites.requestAgentSeat — the owner≠host consent request over the real graph", () => {
  test("an owner-member requests → a durable agent-seat-requested notification lands in the host's inbox", async ({ db, ownerCaller, otherCaller }) => {
    const chatId = await freshChat(db);
    await seedParticipant(db, { chatId, key: "req_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(db, { chatId, key: "req_o", userId: OTHER_USER_ID, role: "member" });

    await otherCaller.invites.requestAgentSeat({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" });

    // The durable row — the security-relevant fact (delivered to the HUMAN host, secret-free payload).
    const rows = await db.select().from(notifications).where(eq(notifications.recipientUserId, OWNER_USER_ID));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("agent-seat-requested");
    const payload = rows[0]?.payload;
    expect(payload?.type === "agent-seat-requested" ? payload.ownerUserId : null).toBe(OTHER_USER_ID);
    expect(payload?.type === "agent-seat-requested" ? payload.sourceKind : null).toBe("buddy");

    // Durable-first delivery is queryable through the host's own inbox read (the after-commit fan-out path).
    const inbox = await ownerCaller.notifications.list();
    expect(inbox.items.map((i) => i.type)).toContain("agent-seat-requested");

    // Advisory: no roster mutation — the request writes no participant row.
    const seats = await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId));
    expect(seats.every((s) => s.kind !== "agent")).toBe(true);
  });

  test("a non-member requester is refused leak-free (NOT_FOUND); no notification row", async ({ db, ownerCaller, otherCaller }) => {
    void ownerCaller; // seeds OWNER_USER_ID (the host) so the participant FK resolves
    const chatId = await seedChat(db, "req_stranger");
    await seedParticipant(db, { chatId, key: "rs_h", userId: OWNER_USER_ID, role: "host" });
    // otherCaller is NOT seated in this room — requireParticipant collapses to NOT_FOUND before the owner check.

    await expect(otherCaller.invites.requestAgentSeat({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" })).toThrowTRPCError("NOT_FOUND");
    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(0);
  });
});

describe("invites.kick — unseats a seated agent over the wire (no inbox → no notification abort)", () => {
  test("kicking a seated agent resolves (never agent_recipient) and clears the agent seat", async ({ db, ownerCaller, otherCaller }) => {
    void otherCaller; // seeds OTHER_USER_ID (the buddy owner) so the seat can mint
    const chatId = await seedChat(db, "unseat");
    await seedParticipant(db, { chatId, key: "us_h", userId: OWNER_USER_ID, role: "host" });
    await seedParticipant(db, { chatId, key: "us_o", userId: OTHER_USER_ID, role: "member" });

    const seat = await ownerCaller.chat.seatAgent({ chatId, ownerUserId: OTHER_USER_ID, sourceKind: "buddy" });
    const agentUserId = seat.userId;
    expect(agentUserId).not.toBeNull();

    // The fix under test: kick must NOT try to deliver a `kicked` notification to the agent (which
    // notifications.record refuses). It resolves cleanly and stamps leftSeq.
    await ownerCaller.invites.kick({ chatId, userId: agentUserId ?? OTHER_USER_ID });

    const present = await db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "agent"), isNull(chatParticipants.leftSeq)));
    expect(present).toHaveLength(0);
    // No `kicked` notification was ever addressed to the agent (agents have no inbox).
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientUserId, agentUserId ?? OTHER_USER_ID));
    expect(notes).toHaveLength(0);
  });
});
