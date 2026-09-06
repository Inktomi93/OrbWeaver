// op: resolveStandingAsks (#1799) — the chat-side answer behind `InboxView.actionable`. Real db, because
// the whole claim is about what two chat tables say: `chat_invites.status` and `chats.pending_host_user_id`.
//
// THE DEFECT IT EXISTS FOR: an inbox row outlives its decision. An invite accepted from a share link, one
// the host revoked, one accepted HERE whose follow-up dismiss failed (#1501), a nomination someone already
// accepted or the host re-pointed at a third person — every one leaves the notification row exactly where
// it was. So the pins below are all "the row would still be there; is the ASK still there?".
//
// THE SCOPE PIN IS THE OTHER HALF, and it is not decoration: this read runs for whoever is holding an inbox
// page, so an id belonging to somebody else's room must come back ABSENT rather than standing — otherwise
// the bell would answer "yes, that exists" about another user's invite.

import type { InviteStatus } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatInvites, chats } from "@orb/db";
import type { ChatInviteId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createResolveStandingAsks } from "@orb/server/domain/chat";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

let db: Db;
let reader: UserId;
let other: UserId;

beforeEach(async () => {
  db = await freshDb();
  reader = (await seedUser(db)).id;
  other = (await seedUser(db)).id;
});

/** A targeted invite row addressed at `invitedUserId`, in whatever status the case needs. */
async function seedInvite(invitedUserId: UserId | null, status: InviteStatus): Promise<ChatInviteId> {
  const chat = await seedChat(db);
  const id = mintTypeId(ID_PREFIX.chatInvite);
  await db.insert(chatInvites).values({ id, chatId: chat.id, tokenHash: `hash_${id}`, invitedUserId, status, createdAt: 0 });
  return id;
}

describe("invites — the ask is the STATUS, not the row's existence", () => {
  test("a pending invite addressed to the reader is standing; every settled status is not", async () => {
    const resolve = createResolveStandingAsks(db);
    const pending = await seedInvite(reader, "pending");
    const accepted = await seedInvite(reader, "accepted");
    const declined = await seedInvite(reader, "declined");
    const revoked = await seedInvite(reader, "revoked");
    const expired = await seedInvite(reader, "expired");

    const standing = await resolve({ recipientUserId: reader, inviteIds: [pending, accepted, declined, revoked, expired], nominatedChatIds: [] });

    expect(standing.inviteIds).toEqual([pending]);
  });

  test("another user's pending invite — and an untargeted share link — are NOT the reader's ask", async () => {
    // The scope half. A share-link invite (`invited_user_id IS NULL`) addresses nobody, so nobody's inbox
    // is waiting on it; a foreign-targeted one is somebody else's decision and must not be confirmable here.
    const resolve = createResolveStandingAsks(db);
    const foreign = await seedInvite(other, "pending");
    const shareLink = await seedInvite(null, "pending");

    const standing = await resolve({ recipientUserId: reader, inviteIds: [foreign, shareLink], nominatedChatIds: [] });

    expect(standing.inviteIds).toEqual([]);
  });

  test("an id that names no row at all is simply absent — same answer as settled", async () => {
    // One indistinguishable answer for settled / gone / never-yours: what keeps the read from being an
    // existence oracle. (Also the live shape of a notification whose invite row was hard-deleted with its
    // chat — the inbox row survives the cascade, the ask does not.)
    const resolve = createResolveStandingAsks(db);
    const standing = await resolve({ recipientUserId: reader, inviteIds: [mintTypeId(ID_PREFIX.chatInvite)], nominatedChatIds: [] });
    expect(standing.inviteIds).toEqual([]);
  });
});

describe("handoff nominations — the ask is the pointer, and it moves", () => {
  test("a chat nominating the reader is standing; one nominating somebody else is not", async () => {
    const resolve = createResolveStandingAsks(db);
    const mine = await seedChat(db, { pendingHostUserId: reader });
    const theirs = await seedChat(db, { pendingHostUserId: other });

    const standing = await resolve({ recipientUserId: reader, inviteIds: [], nominatedChatIds: [mine.id, theirs.id] });

    expect(standing.nominatedChatIds).toEqual([mine.id]);
  });

  test("accepting or withdrawing a nomination clears the column, and with it the ask", async () => {
    // `acceptHostHandoff` nulls `pending_host_user_id` in the same statement that swaps the role, and a
    // host cancelling nulls it too — so this is both settle paths at once, on a row that never moved.
    const resolve = createResolveStandingAsks(db);
    const chat = await seedChat(db, { pendingHostUserId: reader });
    expect((await resolve({ recipientUserId: reader, inviteIds: [], nominatedChatIds: [chat.id] })).nominatedChatIds).toEqual([chat.id]);

    await db.update(chats).set({ pendingHostUserId: null }).where(eq(chats.id, chat.id));

    expect((await resolve({ recipientUserId: reader, inviteIds: [], nominatedChatIds: [chat.id] })).nominatedChatIds).toEqual([]);
  });

  test("a RE-NOMINATE at a third person takes the ask away from the first", async () => {
    const resolve = createResolveStandingAsks(db);
    const chat = await seedChat(db, { pendingHostUserId: reader });
    await db.update(chats).set({ pendingHostUserId: other }).where(eq(chats.id, chat.id));

    expect((await resolve({ recipientUserId: reader, inviteIds: [], nominatedChatIds: [chat.id] })).nominatedChatIds).toEqual([]);
    expect((await resolve({ recipientUserId: other, inviteIds: [], nominatedChatIds: [chat.id] })).nominatedChatIds).toEqual([chat.id]);
  });
});

test("an empty ask costs no query and answers empty", async () => {
  // The common inbox page names nothing (notices + the consent singleton), and `inArray` on an empty list
  // is a SQL error — so the short-circuit is a correctness requirement, not an optimisation.
  const resolve = createResolveStandingAsks(db);
  const standing = await resolve({ recipientUserId: castId<UserId>("user_nobody"), inviteIds: [], nominatedChatIds: [] });
  expect(standing).toEqual({ inviteIds: [], nominatedChatIds: [] });
});
