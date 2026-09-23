// The invite lifecycle + THE participant-insert chokepoint (the chat design doc Part III §2). Proves against a real
// libSQL db: the token is stored HASHED (never raw), the atomic redeem inserts a server-forced `member` at the
// canon head, the re-add upsert re-joins a previously-left member, revoke/decline flip status, and an invalid
// token is a leak-free NOT_FOUND. The `hashToken`/`newInviteId`/`loadParticipantViews` deps are faked (the
// root wires the real ones — see invites.ts FLAG[invite-deps-not-on-ctx]). The verbs are reached through the
// grouped-file BUNDLE (`createInvites(ctx, deps)`).

import type { ParticipantView } from "@orb/contracts/chat";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { chatInvites, chatParticipants } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { ChatId, ChatInviteId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ClaimChatOp } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { createInvites } from "../../../../../packages/server/src/domain/chat/verbs/invites.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, makeChatContext, makeLoadParticipantViews, noClaim, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../_support.ts";

let db: Db;
let emitted: number;
let loadParticipantViews: ReturnType<typeof makeLoadParticipantViews>;

beforeEach(async () => {
  db = await freshDb();
  emitted = 0;
  loadParticipantViews = makeLoadParticipantViews(db);
});

function principal(userId: UserId): ReturnType<typeof makePrincipal> {
  return makePrincipal(userId, { handle: castId<Handle>(userId) });
}

// hashToken/newInviteId now ride the ctx — makeChatContext supplies the same `h:${token}` fake
// hasher + a deterministic chat_invite minter; deps carry only the bus emit + the roster resolver.
function makeDeps(): {
  emit: () => Promise<void>;
  loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
  claimChat: ClaimChatOp;
} {
  return {
    emit: (): Promise<void> => {
      emitted += 1;
      return Promise.resolve();
    },
    loadParticipantViews,
    claimChat: noClaim,
  };
}

/** Seed a pending invite with the fake-hashed token. */
async function seedInvite(
  chatId: ChatId,
  token: string,
  opts: { readonly invitedUserId?: UserId; readonly maxUses?: number | null } = {},
): Promise<ChatInviteId> {
  const id = castId<ChatInviteId>(`chat_invite_seed_${token}`);
  await db.insert(chatInvites).values({
    id,
    chatId,
    tokenHash: `h:${token}`,
    maxUses: opts.maxUses ?? null,
    uses: 0,
    expiresAt: null,
    invitedUserId: opts.invitedUserId ?? null,
    status: "pending",
    createdAt: FROZEN_AT,
  });
  return id;
}

describe("createInvite — host mints a share-link; the token is stored HASHED", () => {
  test("the raw token is returned ONCE; only its hash is persisted", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const { invite, token } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: {},
    });

    expect(token.length).toBeGreaterThan(0);
    expect(invite.status).toBe("pending");
    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row?.tokenHash).toBe(`h:${token}`); // hashed
    expect(row?.tokenHash).not.toBe(token); // never the raw token
  });

  // The bounds are SAFE BY DEFAULT (2026-09-07): an omitted `maxUses`/`expiresAt` used to persist NULL/NULL,
  // which the redeem predicate reads as unlimited-uses AND never-expires — `createInvite({})` minted a
  // permanent share link. Nothing asserted that, so nothing guarded it; these two tests are the guard. The
  // deliberate durable link is still reachable, but only by saying `expiresAt: null` out loud.
  test("an omitted maxUses/expiresAt defaults to single-use and a 48h TTL", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const { invite } = await invites.createInvite({ principal: principal(host), chatId, input: {} });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row?.maxUses).toBe(1);
    expect(row?.expiresAt).toBe(FROZEN_AT + 48 * 60 * 60 * 1000);
  });

  test("an EXPLICIT expiresAt:null still means never-expires (the durable-link escape hatch)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: { expiresAt: null, maxUses: 25 },
    });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row?.expiresAt).toBeNull();
    expect(row?.maxUses).toBe(25);
  });

  test("an EXPLICIT maxUses:null still means unlimited (the other half of the escape hatch)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const { invite } = await invites.createInvite({ principal: principal(host), chatId, input: { maxUses: null } });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    // NULL is what `redeemInviteAtomic` reads as unlimited (`isNull(maxUses)`), so this is the persisted
    // shape that arm depends on — not merely "not 1".
    expect(row?.maxUses).toBeNull();
    // …and the OTHER bound still took its safe default, because only one field was spoken for.
    expect(row?.expiresAt).toBe(FROZEN_AT + 48 * 60 * 60 * 1000);
  });

  test("a plain member is refused with not_host", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const err = await invites.createInvite({ principal: principal(member), chatId, input: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("a targeted-by-handle invite resolves the target and stores invitedUserId", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const bob = await seedUser(db, castId<Handle>("bob"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db, { resolveHandle: (h) => Promise.resolve(h === "bob" ? bob : null) }), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: { invitedHandle: castId<Handle>("bob") },
    });
    expect(invite.invitedUserId).toBe(bob);
  });

  test("an unknown/disabled target handle is a coded invite_target_unknown refusal", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const invites = createInvites(makeChatContext(db, { resolveHandle: () => Promise.resolve(null) }), makeDeps());

    const err = await invites
      .createInvite({
        principal: principal(host),
        chatId,
        input: { invitedHandle: castId<Handle>("ghost") },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainOperationError);
    expect((err as DomainOperationError).code).toBe("invite_target_unknown");
  });
});

describe("createInvite — the targeted-invite notification", () => {
  function recordingCtx(notes: NotificationEvent[]): ReturnType<typeof makeChatContext> {
    return makeChatContext(db, {
      resolveHandle: (h) => Promise.resolve(h === "bob" ? castId<UserId>("user_bob") : null),
      emitNotification: (event) => {
        notes.push(event);
        return Promise.resolve();
      },
    });
  }

  test("a targeted invite emits `invite` AFTER persist, carrying inviteId + the host's handle", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const bob = await seedUser(db, castId<Handle>("bob"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const notes: NotificationEvent[] = [];
    const invites = createInvites(recordingCtx(notes), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: { invitedHandle: castId<Handle>("bob") },
    });

    expect(invite.invitedUserId).toBe(bob);
    expect(notes).toEqual([
      {
        type: "invite",
        recipientUserId: bob,
        chatId,
        inviteId: invite.id,
        invitedByHandle: principal(host).handle,
      },
    ]);
    // The notification NEVER carries the raw token (type-level unrepresentable — the schema declares no
    // field for it); the row is already persisted (durable-first) by the time the notification fires.
    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, invite.id));
    expect(row).toBeDefined();
  });

  test("a share-link invite (no invitedUserId) notifies nobody — no single recipient", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const notes: NotificationEvent[] = [];
    const invites = createInvites(recordingCtx(notes), makeDeps());

    const { invite } = await invites.createInvite({
      principal: principal(host),
      chatId,
      input: {},
    });

    expect(invite.invitedUserId).toBeNull();
    expect(notes).toEqual([]);
  });
});

describe("redeemInvite — THE participant-insert chokepoint", () => {
  test("a fresh redeem inserts a server-forced member at the canon head + bumps uses", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(joiner),
      input: { token: "tok" },
    });

    expect(result.chat.id).toBe(chatId);
    expect(result.participant.userId).toBe(joiner);
    expect(result.participant.role).toBe("member");
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.role).toBe("member");
    expect(row?.leftSeq).toBeNull();
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.chatId, chatId));
    expect(inv?.uses).toBe(1);
    expect(emitted).toBe(1); // chatUpdated
  });

  test("the re-add upsert re-joins a previously-left member", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const back = await seedUser(db, castId<Handle>("back"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // back left earlier (leftSeq set) — the redeem upsert must re-join them.
    await seedParticipant(db, { chatId, key: "b", userId: back, role: "member", leftSeq: 3 });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(back), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, back));
    expect(row?.leftSeq).toBeNull();
    expect(row?.role).toBe("member");
  });

  test("an invalid token is a leak-free NOT_FOUND", async () => {
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const invites = createInvites(makeChatContext(db), makeDeps());
    await expect(invites.redeemInvite({ principal: principal(joiner), input: { token: "nope" } })).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});

// THE JOIN FLOOR IS THIS ROOM'S HEAD, NEVER THE TABLE'S (#2244). `joinSeq` is D16's history floor: every arm
// below seats a joiner in a chat whose canon head is LOW while a NEIGHBOUR chat carries a HIGHER `messages.seq`,
// which is the only shape that can tell a correlated `max(seq) WHERE chat_id = <this chat>` apart from a
// table-wide `max(seq)`. A single-chat db cannot — the two answers coincide — which is exactly why the
// chokepoint's own `freshDb()` arms above never saw it and the defect only surfaced on the e2e's shared,
// many-chat database, as a `from-join` member whose whole room read back EMPTY. Three of the four arms were
// RED before the fix (they stamped the neighbour's 9); the fourth says so on itself.
describe("redeemInvite/acceptInvite — the join floor is THIS chat's canon head (#2244)", () => {
  const targetHead = 2;
  const neighbourHead = 9;

  /** Seed the room the joiner is invited to (head {@link targetHead}) beside an unrelated, busier room
   *  (head {@link neighbourHead}) owned by the same host. Returns the target chat id. */
  async function seedTargetBesideBusierNeighbour(host: UserId): Promise<ChatId> {
    const chatId = await seedChat(db, "target");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    for (let seq = 1; seq <= targetHead; seq += 1) {
      await seedMessage(db, chatId, seq);
    }
    const neighbourId = await seedChat(db, "neighbour");
    await seedParticipant(db, { chatId: neighbourId, key: "nh", userId: host, role: "host" });
    for (let seq = 1; seq <= neighbourHead; seq += 1) {
      await seedMessage(db, neighbourId, seq);
    }
    return chatId;
  }

  test("a token redeem stamps the TARGET chat's head, not the busiest chat's", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedTargetBesideBusierNeighbour(host);
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(joiner), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.joinSeq).toBe(targetHead);
  });

  test("an accept-by-id stamps the TARGET chat's head (the second door onto the same seat builder)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedTargetBesideBusierNeighbour(host);
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.acceptInvite({ principal: principal(target), inviteId });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, target));
    expect(row?.joinSeq).toBe(targetHead);
  });

  // A FENCE, NOT A DEFECT PROOF — this arm was GREEN before the #2244 fix and stays green after it. The
  // `ON CONFLICT … DO UPDATE` half is outside the `INSERT … SELECT` projection, so drizzle already rendered
  // its correlation qualified (`"messages"."chat_id" = "chat_participants"."chat_id"`). It is pinned because
  // both re-join doors share one builder with the broken arm, and nothing else held that half still.
  test("a RE-JOIN re-stamps the target chat's head (the ON CONFLICT arm)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const back = await seedUser(db, castId<Handle>("back"));
    const chatId = await seedTargetBesideBusierNeighbour(host);
    await seedParticipant(db, { chatId, key: "b", userId: back, role: "member", joinSeq: 0, leftSeq: 1 });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(back), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, back));
    expect(row?.leftSeq).toBeNull();
    expect(row?.joinSeq).toBe(targetHead);
  });

  test("an EMPTY target room floors the joiner at 0 even while other rooms carry canon", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "empty");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const neighbourId = await seedChat(db, "neighbour");
    await seedParticipant(db, { chatId: neighbourId, key: "nh", userId: host, role: "host" });
    await seedMessage(db, neighbourId, 1);
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(joiner), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.joinSeq).toBe(0);
  });
});

// INVITE-JOIN-NULL-PERSONA. Both join paths seated the member with `activePersonaId = NULL`, so every message
// they wrote persisted `persona_id = NULL` — floored to the unresolvable-persona name on both render surfaces,
// and (before the SHAPE guard) handed the HOST's persona on the wire. The seat now runs the SAME seed chain
// `startChat` runs for the founding host row: current persona, then default. Proved through the VERB, because
// the resolvers live on `ChatContext` and the persistence layer only stores what it is handed.
describe("redeem/accept — the joiner's seat is born with their persona", () => {
  test("redeemInvite seats the joiner's CURRENT persona", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const current = await seedPersona(db, joiner, "joiner_current");
    const fallback = await seedPersona(db, joiner, "joiner_default");
    const invites = createInvites(
      makeChatContext(db, {
        resolveCurrentPersona: () => Promise.resolve(current),
        resolveDefaultPersona: () => Promise.resolve(fallback),
      }),
      makeDeps(),
    );

    await invites.redeemInvite({ principal: principal(joiner), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.activePersonaId).toBe(current);
  });

  test("redeemInvite falls to the joiner's DEFAULT persona when they hold no current one", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const fallback = await seedPersona(db, joiner, "joiner_default");
    const invites = createInvites(makeChatContext(db, { resolveDefaultPersona: () => Promise.resolve(fallback) }), makeDeps());

    await invites.redeemInvite({ principal: principal(joiner), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.activePersonaId).toBe(fallback);
  });

  test("acceptInvite (the token-free by-id path) seats it too — the sibling that also had to be fixed", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: joiner });
    const current = await seedPersona(db, joiner, "joiner_current");
    const invites = createInvites(makeChatContext(db, { resolveCurrentPersona: () => Promise.resolve(current) }), makeDeps());

    await invites.acceptInvite({ principal: principal(joiner), inviteId });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.activePersonaId).toBe(current);
  });

  test("a joiner who holds NO persona at all still seats — null is the honest floor, never the room's anchor", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const joiner = await seedUser(db, castId<Handle>("joiner"));
    const chatId = await seedChat(db, "a");
    const anchor = await seedPersona(db, host, "host_anchor");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host", activePersonaId: anchor });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(joiner), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, joiner));
    expect(row?.activePersonaId).toBeNull();
  });
});

// Stickler F4: `redeemInvite` enforced `maxUses`/expiry but NOT the stored `invitedUserId`, while its siblings
// (`previewInvite`/`declineInvite`) did — so a targeted-invite token that reached the wrong user still joined
// them. The atomic redeem now carries the `(untargeted OR target=caller)` predicate: a non-target's claim
// matches nothing (never burns a use), and the verb surfaces the same leak-free NOT_FOUND an invalid token
// gives. An untargeted (share-link) invite is unaffected.
describe("redeemInvite — targeting (F4)", () => {
  test("a targeted invite redeemed by a NON-target is refused leak-free — and burns no use", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const attacker = await seedUser(db, castId<Handle>("attacker"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    // The token reached the wrong user (forwarded / mis-posted); the attacker redeems it directly.
    await expect(invites.redeemInvite({ principal: principal(attacker), input: { token: "tok" } })).rejects.toBeInstanceOf(DomainNotFoundError);

    // No membership was granted, and the atomic UPDATE never matched — the use count + status are untouched,
    // so the invite is still fully redeemable by its real target.
    const attackerRows = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, attacker));
    expect(attackerRows).toHaveLength(0);
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(0);
    expect(inv?.status).toBe("pending");
  });

  test("the same targeted invite still redeems for its intended target", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(target),
      input: { token: "tok" },
    });

    expect(result.participant.userId).toBe(target);
    expect(result.participant.role).toBe("member");
  });

  test("an untargeted (share-link) invite still redeems for anyone", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const anyone = await seedUser(db, castId<Handle>("anyone"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok"); // no invitedUserId ⇒ untargeted
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.redeemInvite({
      principal: principal(anyone),
      input: { token: "tok" },
    });

    expect(result.participant.userId).toBe(anyone);
    expect(result.participant.role).toBe("member");
  });
});

// Stickler F5: the atomic UPDATE incremented `uses` BEFORE `upsertMemberOnJoin` no-oped for an already-present
// member, so a bookmarked /join re-fire ate a finite invite's remaining use. The redeem now carries a
// `caller-not-already-present` predicate: a present member's re-redeem matches nothing (no burn, no status
// flip) and the verb recovers their existing membership, leaving the invite's remaining uses for real joiners.
describe("redeemInvite — idempotent re-redeem does not burn a use (F5)", () => {
  test("maxUses:2 — a present member re-redeems: uses stays 1, status pending, a second joiner still gets in", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const first = await seedUser(db, castId<Handle>("first"));
    const second = await seedUser(db, castId<Handle>("second"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { maxUses: 2 });
    const invites = createInvites(makeChatContext(db), makeDeps());

    // First joiner redeems (uses 0 → 1) and joins.
    await invites.redeemInvite({ principal: principal(first), input: { token: "tok" } });
    // The bookmarked /join re-fires while `first` is still present — this must NOT burn the second use.
    const again = await invites.redeemInvite({
      principal: principal(first),
      input: { token: "tok" },
    });
    expect(again.participant.userId).toBe(first); // recovered their existing membership, not a phantom error

    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1); // NOT 2 — the re-redeem burned nothing
    expect(inv?.status).toBe("pending"); // still redeemable

    // The intended second joiner still gets in (they would have been locked out if the re-fire had exhausted it).
    const secondResult = await invites.redeemInvite({
      principal: principal(second),
      input: { token: "tok" },
    });
    expect(secondResult.participant.userId).toBe(second);
    const [after] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(after?.uses).toBe(2);
    expect(after?.status).toBe("accepted"); // exhausted by the two DISTINCT joiners
  });

  test("a previously-LEFT member still re-redeems + re-joins (the not-present predicate only guards PRESENT members)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const back = await seedUser(db, castId<Handle>("back"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "b", userId: back, role: "member", leftSeq: 3 });
    const inviteId = await seedInvite(chatId, "tok", { maxUses: 2 });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.redeemInvite({ principal: principal(back), input: { token: "tok" } });

    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, back));
    expect(row?.leftSeq).toBeNull(); // re-joined
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1); // a genuine (re)join DOES consume a use
  });
});

// acceptInvite — the token-FREE in-app accept-by-id (the notification→accept loop). SELF-AUTHORIZING: the
// caller's authenticated identity is the authorization (the invite is BOUND to `invitedUserId`). Every failure
// mode — foreign / share-link / expired / exhausted / declined / revoked / unknown id — collapses to the SAME
// leak-free NOT_FOUND (no oracle). The seat is server-forced `member`, never host.
describe("acceptInvite — token-free accept-by-id (self-authorizing)", () => {
  test("the bound target accepts by id → seated as a server-forced member at the canon head", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const result = await invites.acceptInvite({ principal: principal(target), inviteId });

    expect(result.chat.id).toBe(chatId);
    expect(result.participant.userId).toBe(target);
    expect(result.participant.role).toBe("member"); // NEVER host
    const [row] = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, target));
    expect(row?.role).toBe("member");
    expect(row?.leftSeq).toBeNull(); // present
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1);
    expect(emitted).toBe(1); // chatUpdated (roster changed)
  });

  test("a FOREIGN user accepting someone else's targeted invite is a leak-free NOT_FOUND — burns no use", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const attacker = await seedUser(db, castId<Handle>("attacker"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.acceptInvite({ principal: principal(attacker), inviteId })).rejects.toBeInstanceOf(DomainNotFoundError);

    const attackerRows = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, attacker));
    expect(attackerRows).toHaveLength(0);
    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(0); // untouched — still acceptable by its real target
    expect(inv?.status).toBe("pending");
  });

  test("a SHARE-LINK invite (no invitedUserId) is NOT acceptable by id — token-only → NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const anyone = await seedUser(db, castId<Handle>("anyone"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok"); // untargeted share-link
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.acceptInvite({ principal: principal(anyone), inviteId })).rejects.toBeInstanceOf(DomainNotFoundError);
    const rows = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, anyone));
    expect(rows).toHaveLength(0);
  });

  test("an EXPIRED targeted invite → NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    await db
      .update(chatInvites)
      .set({ expiresAt: FROZEN_AT - 1 })
      .where(eq(chatInvites.id, inviteId));
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.acceptInvite({ principal: principal(target), inviteId })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("an EXHAUSTED targeted invite (uses == maxUses) → NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target, maxUses: 1 });
    await db.update(chatInvites).set({ uses: 1, status: "accepted" }).where(eq(chatInvites.id, inviteId));
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.acceptInvite({ principal: principal(target), inviteId })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("a DECLINED or REVOKED targeted invite → NOT_FOUND", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const declinedId = await seedInvite(chatId, "d", { invitedUserId: target });
    const revokedId = await seedInvite(chatId, "r", { invitedUserId: target });
    await db.update(chatInvites).set({ status: "declined" }).where(eq(chatInvites.id, declinedId));
    await db.update(chatInvites).set({ status: "revoked" }).where(eq(chatInvites.id, revokedId));
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.acceptInvite({ principal: principal(target), inviteId: declinedId })).rejects.toBeInstanceOf(DomainNotFoundError);
    await expect(invites.acceptInvite({ principal: principal(target), inviteId: revokedId })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("an unknown inviteId → NOT_FOUND (never confirms existence)", async () => {
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const invites = createInvites(makeChatContext(db), makeDeps());
    await expect(
      invites.acceptInvite({
        principal: principal(stranger),
        inviteId: castId<ChatInviteId>("chat_invite_ghost"),
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("an already-present member re-accepting is idempotent — recovers their existing membership, no burn", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target, maxUses: 2 });
    const invites = createInvites(makeChatContext(db), makeDeps());

    const first = await invites.acceptInvite({ principal: principal(target), inviteId });
    expect(first.participant.userId).toBe(target);
    // Re-fire while still present — must NOT burn a second use, and must recover the existing membership.
    const again = await invites.acceptInvite({ principal: principal(target), inviteId });
    expect(again.participant.userId).toBe(target);
    expect(again.participant.role).toBe("member");

    const [inv] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(inv?.uses).toBe(1); // NOT 2 — the re-accept burned nothing
    expect(inv?.status).toBe("pending");
  });
});

describe("revokeInvite / declineInvite — status transitions", () => {
  test("the host revokes a pending invite", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.revokeInvite({ principal: principal(host), chatId, inviteId });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(row?.status).toBe("revoked");
  });

  test("the targeted user declines their invite", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const inviteId = await seedInvite(chatId, "tok", { invitedUserId: target });
    const invites = createInvites(makeChatContext(db), makeDeps());

    await invites.declineInvite({ principal: principal(target), inviteId });

    const [row] = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId));
    expect(row?.status).toBe("declined");
  });
});

describe("previewInvite — minimal preview-then-confirm", () => {
  test("returns room name / host handle / member count / mode label only", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a", { title: "The Tavern" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const invites = createInvites(makeChatContext(db), makeDeps());

    const preview = await invites.previewInvite({
      principal: principal(outsider),
      input: { token: "tok" },
    });

    expect(preview.chatId).toBe(chatId);
    expect(preview.roomName).toBe("The Tavern");
    expect(preview.hostHandle).toBe(host); // the fake resolver maps handle from the host's id
    expect(preview.memberCount).toBe(1);
    expect(preview.modeLabel).toBe("per-speaker · natural");
  });

  test("a hostless participant view is an invariant failure, never an empty branded handle", async () => {
    const chatId = await seedChat(db, "a", { title: "The Tavern" });
    await seedInvite(chatId, "tok");
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    loadParticipantViews = (): Promise<readonly ParticipantView[]> => Promise.resolve([]);
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.previewInvite({ principal: principal(outsider), input: { token: "tok" } })).rejects.toThrow(
      `previewInvite: chat ${chatId} has no host participant`,
    );
  });

  test("a host participant without a public handle is the same invariant failure", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a", { title: "The Tavern" });
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const loadViews = loadParticipantViews;
    loadParticipantViews = async (id): Promise<readonly ParticipantView[]> =>
      (await loadViews(id)).map((participant) => (participant.role === "host" ? { ...participant, handle: null } : participant));
    const invites = createInvites(makeChatContext(db), makeDeps());

    await expect(invites.previewInvite({ principal: principal(outsider), input: { token: "tok" } })).rejects.toThrow(
      `previewInvite: chat ${chatId} has no host participant`,
    );
  });
});

describe("listInvites — the host-management outstanding-invites read (FIX #4)", () => {
  test("the host sees every invite newest-first with remainingUses computed; no token field exists", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const target = await seedUser(db, castId<Handle>("target"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const unlimitedId = await seedInvite(chatId, "tok-a");
    const finiteId = await seedInvite(chatId, "tok-b", { invitedUserId: target, maxUses: 3 });
    // Burn one use on the finite invite so remainingUses proves it's DERIVED (maxUses - uses), not echoed.
    await db.update(chatInvites).set({ uses: 1 }).where(eq(chatInvites.id, finiteId));
    const invites = createInvites(makeChatContext(db), makeDeps());

    const views = await invites.listInvites({ principal: principal(host), chatId });

    expect(views.map((v) => v.id).sort()).toEqual([unlimitedId, finiteId].sort());
    const unlimited = views.find((v) => v.id === unlimitedId);
    expect(unlimited?.remainingUses).toBeNull(); // maxUses null = unlimited
    expect(unlimited?.invitedUserId).toBeNull();
    const finite = views.find((v) => v.id === finiteId);
    expect(finite?.maxUses).toBe(3);
    expect(finite?.remainingUses).toBe(2);
    expect(finite?.invitedUserId).toBe(target);
    // The view never carries the token, raw OR hashed (a leak would let anyone redeem).
    for (const view of views) {
      expect(Object.keys(view)).not.toContain("tokenHash");
      expect(Object.keys(view)).not.toContain("token");
    }
  });

  test("a plain member is refused with not_host (the sibling createInvite/revokeInvite belt)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    const err = await invites.listInvites({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
  });

  test("a non-member outsider gets the leak-free NOT_FOUND (requireHost's membership floor)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedInvite(chatId, "tok");
    const invites = createInvites(makeChatContext(db), makeDeps());

    const err = await invites.listInvites({ principal: principal(outsider), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainNotFoundError);
  });
});
