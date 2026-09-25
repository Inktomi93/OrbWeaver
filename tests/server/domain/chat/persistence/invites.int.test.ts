import type { Db } from "@orb/db";
import { auditLogs, chatInvites, chatParticipants, messageReactions, personas, users } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, Handle, MessageReactionId, PendingTurnId, PersonaId, UserId } from "@orb/kit/ids";
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
  redeemSignupAtomic,
  revokeInviteById,
  signupAccountAdmission,
} from "../../../../../packages/server/src/domain/chat/persistence/invites.ts";
import { insertJoinerPersonaStatement } from "../../../../../packages/server/src/domain/persona/persistence/joiner.ts";
import { insertSignupUserStatement } from "../../../../../packages/server/src/domain/sessions/persistence/users.ts";
import { buildAuditStatementIfPrecedingWrote } from "../../../../../packages/server/src/foundation/observability/audit.ts";
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

  test("declineInviteById flips ONLY the caller's own pending targeted invite", async () => {
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

/** A Db that commits one more canon message IMMEDIATELY BEFORE the redeem's claim batch runs — the window a
 *  pre-read `joinSeq` could not see. Everything else delegates untouched. */
function raceDb(real: Db, chatId: ChatId, seq: number): Db {
  return new Proxy(real, {
    get(target, prop, receiver): unknown {
      if (prop !== "batch") {
        return Reflect.get(target, prop, receiver) as unknown;
      }
      return async (...args: Parameters<Db["batch"]>): Promise<unknown> => {
        await seedMessage(real, chatId, seq);
        return await (Reflect.get(target, prop, receiver) as Db["batch"]).apply(target, args);
      };
    },
  }) as Db;
}

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

  test("a message committed just before the claim batch lands BELOW the seat's joinSeq (#1403)", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "race");
    await seedMessage(db, chatId, 1);
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    // THE RACE, made deterministic: a message commits in the window between the redeem's own view of the
    // canon head and the claim batch. `joinSeq` is a HISTORY FLOOR — a message committed BEFORE the member
    // was seated must never sit above it, or history-floor readers show the new member a pre-join message.
    const result = await redeemInviteAtomic(raceDb(db, chatId, 2), {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result?.participant.joinSeq).toBe(2);
  });

  test("the accept-by-id door closes the same window (#1403)", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner2"));
    const chatId = await seedChat(db, "race2");
    await seedMessage(db, chatId, 1);
    await insertInvite(db, {
      id: castId<ChatInviteId>("chat_invite_byid"),
      chatId,
      tokenHash: "hash_byid",
      invitedUserId: joiner,
      maxUses: null,
      expiresAt: null,
      createdAt: FROZEN_AT,
    });

    const result = await acceptInviteByIdAtomic(raceDb(db, chatId, 2), {
      inviteId: castId<ChatInviteId>("chat_invite_byid"),
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_j2"),
      activePersonaId: null,
      now: FROZEN_AT,
    });
    expect(result?.participant.joinSeq).toBe(2);
  });

  test("a previously-LEFT member re-joins through the same claim: joinSeq re-stamped, leftSeq cleared, the row id KEPT", async () => {
    const joiner = await seedUser(db, castId<Handle>("returner"));
    const chatId = await seedChat(db, "rejoin");
    await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 2);
    const existing = await seedParticipant(db, { chatId, key: "r", userId: joiner, role: "member", joinSeq: 0, leftSeq: 1 });
    const hash = await seedInvite(db, chatId, "i", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_ignored"),
      activePersonaId: null,
      now: FROZEN_AT,
    });

    // ONE upserted row per human membership (conflict target: chatId+userId): the re-join re-stamps the floor
    // to the canon head and clears the leave, so a returning member is floored at their LATEST join and their
    // previous era is not re-granted — the storage shape `substrate/auth/clamp.ts` reads that rule off.
    // The seat KEEPS ITS IDENTITY across the re-join (#1542): the caller's freshly-minted participantId is
    // consumed only by the INSERT arm, so the returning member's row id — what `message_reactions` and every
    // other seat-keyed child FKs — never moves.
    expect(await db.select().from(chatParticipants).where(eq(chatParticipants.chatId, chatId))).toHaveLength(1);
    expect(result?.participant.id).toBe(existing);
    expect(result?.participant.joinSeq).toBe(2);
    expect(result?.participant.leftSeq).toBeNull();
    expect(result?.participant.role).toBe("member");
  });

  // #1542 — the seat id is FK'd by `message_reactions.reactor_participant_id` under SQLite's default NO
  // ACTION on update, so a DO UPDATE that MOVED `id` made the whole redeem batch fail for any returning
  // member who had ever reacted: a user-visible "cannot re-join", not id churn. The seat keeps its identity.
  test("a returning member who ever REACTED re-joins: the seat keeps its id and the reaction survives (#1542)", async () => {
    const joiner = await seedUser(db, castId<Handle>("reactor"));
    const chatId = await seedChat(db, "rejoin-reaction");
    const { variantId } = await seedMessage(db, chatId, 1);
    const seat = await seedParticipant(db, { chatId, key: "reactor", userId: joiner, role: "member", joinSeq: 0, leftSeq: 1 });
    await db.insert(messageReactions).values({
      id: castId<MessageReactionId>("message_reaction_rejoin"),
      variantId,
      reactorParticipantId: seat,
      emoji: "\u{1F44D}",
      createdAt: FROZEN_AT,
    });
    const hash = await seedInvite(db, chatId, "reaction-rejoin", { maxUses: 5 });

    const result = await redeemInviteAtomic(db, {
      tokenHash: hash,
      userId: joiner,
      participantId: castId<ChatParticipantId>("chat_participant_fresh_mint"),
      activePersonaId: null,
      now: FROZEN_AT,
    });

    expect(result?.participant.id).toBe(seat);
    expect(result?.participant.leftSeq).toBeNull();
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(1);
    // The reaction still points at the same live seat — nothing orphaned, nothing rolled back.
    expect((await db.select().from(messageReactions)).map((r) => r.reactorParticipantId)).toStrictEqual([seat]);
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
    expect(await countPresentMembers(db, chatId)).toBe(1);
  });

  test("two concurrent claims by the same user consume exactly one use and mint exactly one seat", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "same-user-race");
    const hash = await seedInvite(db, chatId, "same-user-race", { maxUses: 5 });

    const settled = await Promise.allSettled([
      redeemInviteAtomic(db, {
        tokenHash: hash,
        userId: joiner,
        participantId: castId<ChatParticipantId>("chat_participant_race_a"),
        activePersonaId: null,
        now: FROZEN_AT,
      }),
      redeemInviteAtomic(db, {
        tokenHash: hash,
        userId: joiner,
        participantId: castId<ChatParticipantId>("chat_participant_race_b"),
        activePersonaId: null,
        now: FROZEN_AT,
      }),
    ]);

    expect(settled.every((result) => result.status === "fulfilled")).toBe(true);
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(1);
    expect(await countPresentMembers(db, chatId)).toBe(1);
  });

  test("a seat constraint failure rolls the invite use back", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const occupant = await seedUser(db, castId<Handle>("occupant"));
    const occupiedChatId = await seedChat(db, "occupied");
    await seedParticipant(db, { chatId: occupiedChatId, key: "collision", userId: occupant, role: "member" });
    const chatId = await seedChat(db, "claim");
    const hash = await seedInvite(db, chatId, "seat-failure", { maxUses: 5 });

    await expect(
      redeemInviteAtomic(db, {
        tokenHash: hash,
        userId: joiner,
        participantId: castId<ChatParticipantId>("chat_participant_collision"),
        activePersonaId: null,
        now: FROZEN_AT,
      }),
    ).rejects.toThrow();
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(0);
    expect(await countPresentMembers(db, chatId)).toBe(0);
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
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(0);
    expect(await countPresentMembers(db, chatId)).toBe(0);
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
    expect((await findInviteByTokenHash(db, hash))?.uses).toBe(0);
    expect(await countPresentMembers(db, chatId)).toBe(1);
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

// D254 — the signup chain: [account WHERE admits] → [claim WHERE admits AND changes()>0] → [persona WHERE
// changes()>0] → [seat as that persona WHERE changes()>0] → [audit WHERE changes()>0]. The account insert is the
// sessions statement and the persona insert the persona statement the verb hands in.
describe("persistence/invites — redeemSignupAtomic (the gated signup chain)", () => {
  const Mode = "local" as const;
  const DayMs = 86_400_000;

  async function seedSignupInvite(chatId: ChatId, key: string, over: { readonly maxUses: number; readonly uses: number }): Promise<string> {
    const minter = await seedUser(db, castId<Handle>(`minter_${key}`));
    const tokenHash = `hash_signup_${key}`;
    await db.insert(chatInvites).values({
      id: castId<ChatInviteId>(`chat_invite_signup_${key}`),
      chatId,
      tokenHash,
      maxUses: over.maxUses,
      uses: over.uses,
      expiresAt: FROZEN_AT + DayMs,
      allowSignup: true,
      createdByUserId: minter,
      mintMode: Mode,
      createdAt: FROZEN_AT,
    });
    return tokenHash;
  }

  function attempt(key: string, tokenHash: string, handle: Handle, userId = castId<UserId>(`usr_signup_${handle}`)): Parameters<typeof redeemSignupAtomic>[1] {
    const admission = signupAccountAdmission({ tokenHash, now: FROZEN_AT, mode: Mode });
    const personaId = castId<PersonaId>(`persona_signup_${handle}`);
    return {
      tokenHash,
      now: FROZEN_AT,
      mode: Mode,
      leading: [],
      account: insertSignupUserStatement(db, { id: userId, handle, passwordHash: "scrypt$fake", at: FROZEN_AT }, admission),
      persona: insertJoinerPersonaStatement(db, { id: personaId, ownerId: userId, persona: { name: handle, description: "" }, at: FROZEN_AT }),
      personaId,
      audit: buildAuditStatementIfPrecedingWrote(db, { actorUserId: userId, action: "invites.signup", entityType: "chat_invite", entityId: key }, FROZEN_AT),
      inviteId: castId<ChatInviteId>(`chat_invite_signup_${key}`),
      userId,
      participantId: castId<ChatParticipantId>(`chat_participant_signup_${handle}`),
    };
  }

  async function counts(
    chatId: ChatId,
    tokenHash: string,
  ): Promise<{ users: number; personas: number; seats: number; audits: number; uses: number | undefined }> {
    return {
      users: (await db.select().from(users)).length,
      personas: (await db.select().from(personas)).length,
      seats: await countPresentMembers(db, chatId),
      audits: (await db.select().from(auditLogs).where(eq(auditLogs.action, "invites.signup"))).length,
      uses: (await findInviteByTokenHash(db, tokenHash))?.uses,
    };
  }

  test("a fresh signup writes one account, one use, one persona, one seat as it and one audit row", async () => {
    const chatId = await seedChat(db, "signup-fresh");
    const hash = await seedSignupInvite(chatId, "fresh", { maxUses: 2, uses: 0 });
    const before = (await db.select().from(users)).length;
    expect(await redeemSignupAtomic(db, attempt("fresh", hash, castId<Handle>("friend")))).toEqual({ accounts: 1, claims: 1, personas: 1, seats: 1 });
    expect(await counts(chatId, hash)).toEqual({ users: before + 1, personas: 1, seats: 1, audits: 1, uses: 1 });
  });

  test("an exhausted signup invite writes no account, no seat, no use and no audit row", async () => {
    const chatId = await seedChat(db, "signup-spent");
    const hash = await seedSignupInvite(chatId, "spent", { maxUses: 1, uses: 1 });
    const before = (await db.select().from(users)).length;
    expect(await redeemSignupAtomic(db, attempt("spent", hash, castId<Handle>("stranger")))).toEqual({ accounts: 0, claims: 0, personas: 0, seats: 0 });
    expect(await counts(chatId, hash)).toEqual({ users: before, personas: 0, seats: 0, audits: 0, uses: 1 });
  });

  test("two concurrent signups on the last use give one account, one seat, uses == maxUses and one refusal", async () => {
    const chatId = await seedChat(db, "signup-race");
    const hash = await seedSignupInvite(chatId, "race", { maxUses: 2, uses: 1 });
    const before = (await db.select().from(users)).length;
    const settled = await Promise.allSettled([
      redeemSignupAtomic(db, attempt("race", hash, castId<Handle>("alpha"))),
      redeemSignupAtomic(db, attempt("race", hash, castId<Handle>("bravo"))),
    ]);
    const outcomes = settled.map((result) => (result.status === "fulfilled" ? result.value : result.reason));
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { accounts: 1, claims: 1, personas: 1, seats: 1 },
        { accounts: 0, claims: 0, personas: 0, seats: 0 },
      ]),
    );
    expect(await counts(chatId, hash)).toEqual({ users: before + 1, personas: 1, seats: 1, audits: 1, uses: 2 });
  });

  test("a handle that matches an existing one case-insensitively writes nothing and spends no use", async () => {
    const chatId = await seedChat(db, "signup-case");
    const hash = await seedSignupInvite(chatId, "case", { maxUses: 3, uses: 0 });
    await seedUser(db, castId<Handle>("Friend"));
    const before = (await db.select().from(users)).length;
    expect(await redeemSignupAtomic(db, attempt("case", hash, castId<Handle>("friend")))).toEqual({ accounts: 0, claims: 0, personas: 0, seats: 0 });
    expect(await counts(chatId, hash)).toEqual({ users: before, personas: 0, seats: 0, audits: 0, uses: 0 });
  });

  test("a unique violation inside the batch throws and rolls the whole chain back", async () => {
    const chatId = await seedChat(db, "signup-unique");
    const hash = await seedSignupInvite(chatId, "unique", { maxUses: 3, uses: 0 });
    // The account insert reuses a live user id: its primary key collides after the admission passed.
    const taken = await seedUser(db, castId<Handle>("occupant"));
    const before = (await db.select().from(users)).length;
    await expect(redeemSignupAtomic(db, attempt("unique", hash, castId<Handle>("newcomer"), taken))).rejects.toThrow();
    expect(await counts(chatId, hash)).toEqual({ users: before, personas: 0, seats: 0, audits: 0, uses: 0 });
  });
});
