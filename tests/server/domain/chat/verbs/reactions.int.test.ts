// verbs: toggleReaction + listReactions (B6/MR0-MR1) against a real libSQL db. What it proves, in the order
// the plane's own header claims it: the toggle is IDEMPOTENT IN BOTH DIRECTIONS by the UNIQUE (never by
// writer discipline); it announces on the bus ONLY when a row actually moved; the grouping is a READ
// projection over one row per reactor (two members' 👍 is ONE chip with two reactors, not two chips); the
// anchor is the VARIANT (a sibling swipe carries its own set, and a variant delete CASCADES); and both gates
// bite — a non-member's chatId and a member's foreign/below-floor variantId are the SAME leak-free NOT_FOUND.
//
// The two gates are probed SEPARATELY on purpose. The cross-tenant sweep proves the chatId chokepoint over
// the whole router; what it cannot reach is the second belt, because a stranger is refused before the
// variant is ever loaded — so the foreign-variant case is a MEMBER of their own room aiming at another, and
// it can only be probed here.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messageReactions, messageVariants } from "@orb/db";
import type { ChatId, Handle, MessageVariantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createReactions } from "../../../../../packages/server/src/domain/chat/verbs/reactions.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { addVariant, makeChatContext, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
let emitted: DurableChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

function reactions(): ReturnType<typeof createReactions> {
  return createReactions(makeChatContext(db), {
    emit: (event) => {
      emitted.push(event);
      return Promise.resolve();
    },
  });
}

/** A room with a host + a plain member, and one committed assistant slot to react to. */
async function seedRoom(key = "a"): Promise<{
  readonly host: UserId;
  readonly member: UserId;
  readonly chatId: ChatId;
  readonly messageId: Awaited<ReturnType<typeof seedMessage>>["messageId"];
  readonly variantId: MessageVariantId;
}> {
  const host = await seedUser(db, castId<Handle>(`host-${key}`));
  const member = await seedUser(db, castId<Handle>(`member-${key}`));
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `h-${key}`, userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: `m-${key}`, userId: member, role: "member" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1);
  return { host, member, chatId, messageId, variantId };
}

describe("toggleReaction — the write path", () => {
  test("adds, then REMOVES on the second press; each press emits exactly one reactionsChanged", async () => {
    const { host, chatId, messageId, variantId } = await seedRoom();
    const verb = reactions();

    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍" })).toBe(true);
    expect(await db.select().from(messageReactions)).toHaveLength(1);
    expect(await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "👍" })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(0);

    // The emit carries the DIRECTION and the reacted slot — what the `reactionsChanged` trigger fact projects.
    expect(emitted).toEqual([
      { type: "reactionsChanged", chatId, messageId, variantId, emoji: "👍", added: true },
      { type: "reactionsChanged", chatId, messageId, variantId, emoji: "👍", added: false },
    ]);
  });

  test("two members' same emoji are TWO rows and ONE chip — the grouping is a read projection", async () => {
    const { host, member, chatId, variantId } = await seedRoom();
    const verb = reactions();

    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "😂" });
    await verb.toggleReaction({ principal: principal(member), chatId, variantId, emoji: "😂" });

    expect(await db.select().from(messageReactions)).toHaveLength(2);
    const groups = await verb.listReactions({ principal: principal(host), chatId });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.emoji).toBe("😂");
    expect(groups[0]?.reactorParticipantIds).toHaveLength(2);
    // Each seat removes only its OWN row — the keyed DELETE, not the chip.
    await verb.toggleReaction({ principal: principal(member), chatId, variantId, emoji: "😂" });
    expect((await verb.listReactions({ principal: principal(host), chatId }))[0]?.reactorParticipantIds).toHaveLength(1);
  });

  test("a NON-MEMBER's toggle is a leak-free NOT_FOUND and writes nothing", async () => {
    const { chatId, variantId } = await seedRoom();
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const verb = reactions();

    const err = await verb.toggleReaction({ principal: principal(stranger), chatId, variantId, emoji: "🔥" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).name).toBe("ChatNotFoundError");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  test("a MEMBER aiming a FOREIGN room's variantId at their own chat is refused — the variant's own belt", async () => {
    const a = await seedRoom("a");
    const b = await seedRoom("b");
    const verb = reactions();

    // `a.host` is a real member of chat A, and `b.variantId` is a REAL variant — of somebody else's room.
    // The chatId gate passes; the belt this test exists for is what refuses.
    const err = await verb.toggleReaction({ principal: principal(a.host), chatId: a.chatId, variantId: b.variantId, emoji: "👀" }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });

  test("a `from-join` member cannot react BELOW their own D16 floor", async () => {
    const host = await seedUser(db, castId<Handle>("host-f"));
    const late = await seedUser(db, castId<Handle>("late-f"));
    const chatId = await seedChat(db, "f");
    await seedParticipant(db, { chatId, key: "h-f", userId: host, role: "host" });
    // Joined at seq 5 with the OPT-IN restriction: seq 1 is pre-join canon they may not read.
    await seedParticipant(db, { chatId, key: "l-f", userId: late, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    const old = await seedMessage(db, chatId, 1);
    const fresh = await seedMessage(db, chatId, 5);
    const verb = reactions();

    const err = await verb.toggleReaction({ principal: principal(late), chatId, variantId: old.variantId, emoji: "🎉" }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
    // …and the SAME member reacts freely at/above their floor (the floor is a clamp, never a block).
    expect(await verb.toggleReaction({ principal: principal(late), chatId, variantId: fresh.variantId, emoji: "🎉" })).toBe(true);
  });
});

describe("the VARIANT anchor (D26)", () => {
  test("a sibling swipe carries its OWN set, and deleting a variant CASCADES its reactions", async () => {
    const { host, chatId, messageId, variantId } = await seedRoom();
    const sibling = await addVariant(db, messageId, 1, "a reroll");
    const verb = reactions();

    await verb.toggleReaction({ principal: principal(host), chatId, variantId, emoji: "❤️" });
    // The sibling swipe is a DIFFERENT generation — its own (empty) set, which is the whole reason the
    // anchor is the variant rather than the slot.
    const groups = await verb.listReactions({ principal: principal(host), chatId });
    expect(groups.filter((g) => g.variantId === sibling)).toHaveLength(0);
    expect(groups.filter((g) => g.variantId === variantId)).toHaveLength(1);

    await db.delete(messageVariants).where(eq(messageVariants.id, variantId));
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });
});

describe("listReactions — the read", () => {
  test("a NON-MEMBER is refused; a `from-join` member's window omits below-floor slots entirely", async () => {
    const host = await seedUser(db, castId<Handle>("host-r"));
    const late = await seedUser(db, castId<Handle>("late-r"));
    const stranger = await seedUser(db, castId<Handle>("stranger-r"));
    const chatId = await seedChat(db, "r");
    await seedParticipant(db, { chatId, key: "h-r", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "l-r", userId: late, role: "member", joinSeq: 5, joinHistoryVisibility: "from-join" });
    const old = await seedMessage(db, chatId, 1);
    await seedMessage(db, chatId, 5);
    const verb = reactions();

    // The HOST reacts to a pre-join message — real canon the clamped member may not read.
    await verb.toggleReaction({ principal: principal(host), chatId, variantId: old.variantId, emoji: "🤔" });

    expect(await verb.listReactions({ principal: principal(host), chatId })).toHaveLength(1);
    // The clamped member's window is EMPTY — a pill row naming who reacted to a message they cannot see is
    // the same leak one seq lower.
    expect(await verb.listReactions({ principal: principal(late), chatId })).toHaveLength(0);

    const err = await verb.listReactions({ principal: principal(stranger), chatId }).catch((e: unknown) => e);
    expect((err as Error).name).toBe("ChatNotFoundError");
  });
});
