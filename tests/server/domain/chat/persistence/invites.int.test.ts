import type { Db } from "@orb/db";
import { chatInvites } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, Handle, PendingTurnId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  acceptInviteByIdAtomic,
  claimPendingTurn,
  countPresentMembers,
  declineInviteById,
  findInviteById,
  findInviteByTokenHash,
  insertInvite,
  insertPendingTurn,
  listInvitesForChat,
  loadPendingTurns,
  loadPendingTurnsForHost,
  loadPendingTurnsForReclaim,
  redeemInviteAtomic,
  revokeInviteById,
} from "../../../../../packages/server/src/domain/chat/persistence/invites.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedMessage, seedParticipant, seedPendingTurn, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function seedInvite(
  db_: Db,
  chatId: ChatId,
  key: string,
  overrides: { readonly maxUses?: number | null; readonly expiresAt?: number | null } = {},
): Promise<string> {
  const tokenHash = `hash_${key}`;
  await insertInvite(db_, {
    id: castId<ChatInviteId>(`chat_invite_${key}`),
    chatId,
    tokenHash,
    maxUses: overrides.maxUses ?? null,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: FROZEN_AT,
  });
  return tokenHash;
}

describe("persistence/invites — reads + lifecycle", () => {
  test("insertInvite + findInviteByTokenHash round-trips by hash (never raw token)", async () => {
    const chatId = await seedChat(db, "a");
    const hash = await seedInvite(db, chatId, "i", { maxUses: 3 });
    const found = await findInviteByTokenHash(db, hash);
    expect(found?.chatId).toBe(chatId);
    expect(found?.maxUses).toBe(3);
    expect(await findInviteByTokenHash(db, "nope")).toBeUndefined();
  });

  test("countPresentMembers counts present HUMANS only", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const left = await seedUser(db, castId<Handle>("left"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "l", userId: left, role: "member", leftSeq: 5 });
    expect(await countPresentMembers(db, chatId)).toBe(1);
  });

  test("listInvitesForChat returns the chat's invites, newest-first", async () => {
    const chatId = await seedChat(db, "a");
    await seedInvite(db, chatId, "i1");
    await seedInvite(db, chatId, "i2");
    expect(await listInvitesForChat(db, chatId)).toHaveLength(2);
  });

  test("revokeInviteById flips a pending invite once", async () => {
    const chatId = await seedChat(db, "a");
    await seedInvite(db, chatId, "i");
    const inviteId = castId<ChatInviteId>("chat_invite_i");
    expect(await revokeInviteById(db, inviteId, chatId)).toBe(true);
    expect(await revokeInviteById(db, inviteId, chatId)).toBe(false);
    expect((await findInviteByTokenHash(db, "hash_i"))?.status).toBe("revoked");
  });

  test("declineInviteById flips ONLY the caller's own pending targeted invite (PD-67)", async () => {
    const chatId = await seedChat(db, "a");
    const target = await seedUser(db, castId<Handle>("target"));
    const other = await seedUser(db, castId<Handle>("other"));
    await seedInvite(db, chatId, "t");
    const inviteId = castId<ChatInviteId>("chat_invite_t");
    await db.update(chatInvites).set({ invitedUserId: target }).where(eq(chatInvites.id, inviteId));

    // A foreign caller never matches (leak-free no-op); the target flips it exactly once.
    expect(await declineInviteById(db, inviteId, other)).toBe(false);
    expect(await declineInviteById(db, inviteId, target)).toBe(true);
    expect(await declineInviteById(db, inviteId, target)).toBe(false); // idempotent — already declined
    expect((await findInviteByTokenHash(db, "hash_t"))?.status).toBe("declined");
  });
});

describe("persistence/invites — the atomic redeem (the chokepoint)", () => {
  test("redeem inserts the member at the current canon head (joinSeq), increments uses", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 2);
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result?.chatId).toBe(chatId);
    expect(result?.participant.role).toBe("member");
    expect(result?.participant.joinSeq).toBe(2);
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(1);
  });

  test("redeem closes the maxUses TOCTOU: the over-cap attempt yields undefined", async () => {
    const a = await seedUser(db, castId<Handle>("a"));
    const b = await seedUser(db, castId<Handle>("b"));
    const chatId = await seedChat(db, "c");
    const hash = await seedInvite(db, chatId, "i", { maxUses: 1 });

    const first = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: a,
      participantId: castId<ChatParticipantId>("chat_participant_a"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(first).toBeDefined();
    const second = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: b,
      participantId: castId<ChatParticipantId>("chat_participant_b"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(second).toBeUndefined();
    expect((await findInviteByTokenHash(db, hash))?.status).toBe("accepted");
  });

  test("redeem refuses an expired invite", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    const hash = await seedInvite(db, chatId, "i", { expiresAt: FROZEN_AT - 1 });
    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
  });

  test("redeem of an ALREADY-present member is a no-op (undefined), without consuming a use", async () => {
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: member,
      participantId: castId<ChatParticipantId>("chat_participant_dup"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
  });
});

// The token-free accept-by-id sibling — SAME chokepoint physics as the redeem, but keyed on the invite PK +
// SELF-AUTHORIZING (an EXACT `invitedUserId === caller` match, NOT the redeem's untargeted-or-match). A
// share-link invite is token-only → never seatable by id; a foreign target matches nothing.
describe("persistence/invites — the atomic accept-by-id (token-free sibling)", () => {
  async function seedTargetedInvite(
    chatId: ChatId,
    key: string,
    invitedUserId: UserId,
    overrides: { readonly maxUses?: number | null; readonly expiresAt?: number | null } = {},
  ): Promise<ChatInviteId> {
    await seedInvite(db, chatId, key, overrides);
    const inviteId = castId<ChatInviteId>(`chat_invite_${key}`);
    await db.update(chatInvites).set({ invitedUserId }).where(eq(chatInvites.id, inviteId));
    return inviteId;
  }

  test("the bound target is seated at the canon head + a use is burned; findInviteById round-trips", async () => {
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 2);
    const inviteId = await seedTargetedInvite(chatId, "i", target, { maxUses: 5 });

    const result = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: target,
      participantId: castId<ChatParticipantId>("chat_participant_t"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result?.chatId).toBe(chatId);
    expect(result?.participant.role).toBe("member");
    expect(result?.participant.joinSeq).toBe(2);
    expect((await findInviteById(db, inviteId))?.uses).toBe(1);
  });

  test("a SHARE-LINK invite (invitedUserId null) is never seatable by id — undefined, no use burned", async () => {
    const anyone = await seedUser(db, castId<Handle>("anyone"));
    const chatId = await seedChat(db, "a");
    await seedInvite(db, chatId, "i", { maxUses: 5 }); // untargeted
    const inviteId = castId<ChatInviteId>("chat_invite_i");

    const result = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: anyone,
      participantId: castId<ChatParticipantId>("chat_participant_x"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
    expect((await findInviteById(db, inviteId))?.uses).toBe(0);
    expect((await findInviteById(db, inviteId))?.status).toBe("pending");
  });

  test("a FOREIGN target matches nothing (leak-free) — the invite is untouched for its real target", async () => {
    const target = await seedUser(db, castId<Handle>("target"));
    const attacker = await seedUser(db, castId<Handle>("attacker"));
    const chatId = await seedChat(db, "a");
    const inviteId = await seedTargetedInvite(chatId, "i", target);

    const result = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: attacker,
      participantId: castId<ChatParticipantId>("chat_participant_a"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
    const inv = await findInviteById(db, inviteId);
    expect(inv?.uses).toBe(0);
    expect(inv?.status).toBe("pending"); // still redeemable by its real target
  });

  test("an expired invite is refused", async () => {
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    const inviteId = await seedTargetedInvite(chatId, "i", target, { expiresAt: FROZEN_AT - 1 });

    const result = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: target,
      participantId: castId<ChatParticipantId>("chat_participant_t"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
  });

  test("accept of an ALREADY-present member is a no-op (undefined), no use consumed", async () => {
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "t", userId: target, role: "member" });
    const inviteId = await seedTargetedInvite(chatId, "i", target, { maxUses: 5 });

    const result = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: target,
      participantId: castId<ChatParticipantId>("chat_participant_dup"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
    expect((await findInviteById(db, inviteId))?.uses).toBe(0);
  });

  test("closes the maxUses TOCTOU: the single-use invite flips to accepted after the target seats", async () => {
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    const inviteId = await seedTargetedInvite(chatId, "i", target, { maxUses: 1 });

    const first = await acceptInviteByIdAtomic(db, {
      inviteId,
      userId: target,
      participantId: castId<ChatParticipantId>("chat_participant_t"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(first).toBeDefined();
    expect((await findInviteById(db, inviteId))?.status).toBe("accepted");
  });
});

describe("persistence/invites — pending_turns (deferred, boot-reclaimed)", () => {
  test("insert + load (oldest-first) + delete + reclaim-all", async () => {
    const trigger = await seedUser(db, castId<Handle>("trig"));
    const host = await seedUser(db, castId<Handle>("host"));
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    await seedPendingTurn(db, {
      chatId: chatA,
      key: "p1",
      triggeredBy: trigger,
      runAsUserId: host,
      createdAt: 1,
    });
    await seedPendingTurn(db, {
      chatId: chatA,
      key: "p2",
      triggeredBy: trigger,
      runAsUserId: host,
      createdAt: 2,
    });
    await seedPendingTurn(db, {
      chatId: chatB,
      key: "p3",
      triggeredBy: trigger,
      runAsUserId: host,
      createdAt: 3,
    });

    const queued = await loadPendingTurns(db, chatA);
    expect(queued.map((p) => p.id)).toStrictEqual([castId<PendingTurnId>("pending_turn_p1"), castId<PendingTurnId>("pending_turn_p2")]);

    // The atomic claim deletes AND returns the winning row (the drain's exactly-once serializer).
    const claimed = await claimPendingTurn(db, castId<PendingTurnId>("pending_turn_p1"));
    expect(claimed?.id).toBe(castId<PendingTurnId>("pending_turn_p1"));
    // A second claim of the same id finds nothing (a concurrent drain would skip).
    expect(await claimPendingTurn(db, castId<PendingTurnId>("pending_turn_p1"))).toBeUndefined();
    expect(await loadPendingTurns(db, chatA)).toHaveLength(1);
    expect(await loadPendingTurnsForReclaim(db)).toHaveLength(2);
  });

  test("insert round-trips; the by-host load scopes to the funding host (run-as user)", async () => {
    const trigger = await seedUser(db, castId<Handle>("trig"));
    const hostA = await seedUser(db, castId<Handle>("hostA"));
    const hostB = await seedUser(db, castId<Handle>("hostB"));
    const chatA = await seedChat(db, "a");
    const chatB = await seedChat(db, "b");
    // Two turns funded by hostA (across two chats) + one funded by hostB.
    await insertPendingTurn(db, {
      id: castId<PendingTurnId>("pending_turn_a1"),
      chatId: chatA,
      triggeredBy: trigger,
      runAsUserId: hostA,
      createdAt: 1,
    });
    await insertPendingTurn(db, {
      id: castId<PendingTurnId>("pending_turn_a2"),
      chatId: chatB,
      triggeredBy: trigger,
      runAsUserId: hostA,
      createdAt: 2,
    });
    await insertPendingTurn(db, {
      id: castId<PendingTurnId>("pending_turn_b1"),
      chatId: chatB,
      triggeredBy: trigger,
      runAsUserId: hostB,
      createdAt: 3,
    });

    // hostA's return drains their two turns only (oldest-first, across chats); hostB's stays queued.
    const forHostA = await loadPendingTurnsForHost(db, hostA);
    expect(forHostA.map((p) => p.id)).toStrictEqual([castId<PendingTurnId>("pending_turn_a1"), castId<PendingTurnId>("pending_turn_a2")]);
    expect(await loadPendingTurnsForHost(db, hostB)).toHaveLength(1);
    expect(await loadPendingTurnsForReclaim(db)).toHaveLength(3);
  });
});
