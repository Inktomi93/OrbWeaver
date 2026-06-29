import type { Db } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, PendingTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import {
  countPresentMembers,
  createInvite,
  declineInvite,
  deletePendingTurn,
  findInviteByTokenHash,
  listInvitesForChat,
  loadPendingTurns,
  loadPendingTurnsForReclaim,
  redeemInviteAtomic,
  revokeInvite,
} from "../../../../../packages/server/src/domain/chat/persistence/invites";
import { freshDb } from "../../../../support/db";
import {
  FROZEN_AT,
  seedChat,
  seedMessage,
  seedParticipant,
  seedPendingTurn,
  seedUser,
} from "../_support";

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
  await createInvite(db_, {
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
  test("createInvite + findInviteByTokenHash round-trips by hash (never raw token)", async () => {
    const chatId = await seedChat(db, "a");
    const hash = await seedInvite(db, chatId, "i", { maxUses: 3 });
    const found = await findInviteByTokenHash(db, hash);
    expect(found?.chatId).toBe(chatId);
    expect(found?.maxUses).toBe(3);
    expect(await findInviteByTokenHash(db, "nope")).toBeUndefined();
  });

  test("countPresentMembers counts present HUMANS only", async () => {
    const host = await seedUser(db, "host");
    const left = await seedUser(db, "left");
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

  test("revokeInvite flips a pending invite once", async () => {
    const chatId = await seedChat(db, "a");
    await seedInvite(db, chatId, "i");
    const inviteId = castId<ChatInviteId>("chat_invite_i");
    expect(await revokeInvite(db, inviteId, chatId)).toBe(true);
    expect(await revokeInvite(db, inviteId, chatId)).toBe(false);
    expect((await findInviteByTokenHash(db, "hash_i"))?.status).toBe("revoked");
  });

  test("declineInvite flips a pending invite by token hash once", async () => {
    const chatId = await seedChat(db, "a");
    const hash = await seedInvite(db, chatId, "i");
    expect(await declineInvite(db, hash)).toBe(true);
    expect(await declineInvite(db, hash)).toBe(false);
  });
});

describe("persistence/invites — the atomic redeem (the chokepoint)", () => {
  test("redeem inserts the member at the current canon head (joinSeq), increments uses", async () => {
    const joiner = await seedUser(db, "joiner");
    const chatId = await seedChat(db, "a");
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 2);
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j"),
      now: FROZEN_AT,
    });
    expect(result?.chatId).toBe(chatId);
    expect(result?.participant.role).toBe("member");
    expect(result?.participant.joinSeq).toBe(2);
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(1);
  });

  test("redeem closes the maxUses TOCTOU: the over-cap attempt yields undefined", async () => {
    const a = await seedUser(db, "a");
    const b = await seedUser(db, "b");
    const chatId = await seedChat(db, "c");
    const hash = await seedInvite(db, chatId, "i", { maxUses: 1 });

    const first = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: a,
      participantId: castId<ChatParticipantId>("chat_participant_a"),
      now: FROZEN_AT,
    });
    expect(first).toBeDefined();
    const second = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: b,
      participantId: castId<ChatParticipantId>("chat_participant_b"),
      now: FROZEN_AT,
    });
    expect(second).toBeUndefined();
    expect((await findInviteByTokenHash(db, hash))?.status).toBe("accepted");
  });

  test("redeem refuses an expired invite", async () => {
    const joiner = await seedUser(db, "joiner");
    const chatId = await seedChat(db, "a");
    const hash = await seedInvite(db, chatId, "i", { expiresAt: FROZEN_AT - 1 });
    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j"),
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
  });

  test("redeem of an ALREADY-present member is a no-op (undefined), without consuming a use", async () => {
    const member = await seedUser(db, "member");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: member,
      participantId: castId<ChatParticipantId>("chat_participant_dup"),
      now: FROZEN_AT,
    });
    expect(result).toBeUndefined();
  });
});

describe("persistence/invites — pending_turns (deferred, boot-reclaimed)", () => {
  test("insert + load (oldest-first) + delete + reclaim-all", async () => {
    const trigger = await seedUser(db, "trig");
    const host = await seedUser(db, "host");
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
    expect(queued.map((p) => p.id)).toStrictEqual([
      castId<PendingTurnId>("pending_turn_p1"),
      castId<PendingTurnId>("pending_turn_p2"),
    ]);

    await deletePendingTurn(db, castId<PendingTurnId>("pending_turn_p1"));
    expect(await loadPendingTurns(db, chatA)).toHaveLength(1);
    expect(await loadPendingTurnsForReclaim(db)).toHaveLength(2);
  });
});
