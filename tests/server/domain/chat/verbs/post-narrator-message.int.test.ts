// op: postNarratorMessage (docs/plans/rpg/design.md) — the rpg-facing narrator-post op, against a real libSQL db.
// Proves: ONE assistant-role message commits authored by the synthetic group CHARACTER (never a user id — the
// D19/D16-inv-9 rule: authorUserId NULL, characterId = the group char), the body is a STRING carrying one
// `asset:` ref per media (D51) with a `message_assets` retaining row, `messageCommitted` is emitted, and the
// op returns BOTH ids (the variant id rpg's checkpoint-restore couples a snapshot to — rpg_snapshots.variantId).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageAssets, messages, messageVariants, ownerStats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createPostNarratorMessage } from "../../../../../packages/server/src/domain/chat/verbs/post-narrator-message.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, noClaim, seedAsset, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

/** The D124 refusal message. */
const BLANK_POST_RE = /blank post/u;

describe("postNarratorMessage", () => {
  test("commits ONE group-character-authored assistant message + emits messageCommitted + returns both ids", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");

    const ctx = makeChatContext(db, {
      mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }),
      applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
    });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    const { messageId, variantId } = await postNarratorMessage(chatId, "The bell tolls over the drowned city.");

    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(messageId);
    expect(rows[0]?.role).toBe("assistant");
    // The DECLARED purpose (the born-kind belt). It is stamped rather than inferred later from
    // "assistant + the synthetic group character" precisely because that attribution SET-NULLs on a
    // character delete — the row would silently become a standard row and lose its narrator chrome,
    // labelling and mapping. `role` stays `assistant`: kind never decides the canon role.
    expect(rows[0]?.kind).toBe("narrator");
    expect(rows[0]?.characterId).toBe(groupChar);
    expect(rows[0]?.authorUserId).toBeNull();
    expect(rows[0]?.selectedVariantId).toBe(variantId);

    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants).toHaveLength(1);
    expect(variants[0]?.content).toBe("The bell tolls over the drowned city.");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "messageCommitted", chatId, messageId });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host)))[0]?.assistantTurns).toBe(1);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(1);
  });

  test("embeds media as asset refs (D51) with message_assets retaining rows", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");
    const asset = await seedAsset(db, host, "illustration");

    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    const { messageId } = await postNarratorMessage(chatId, "A leviathan breaches.", [asset]);

    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants[0]?.content).toContain("A leviathan breaches.");
    expect(variants[0]?.content).toContain(`![illustration](asset:${asset})`);

    const attachRows = await db.select().from(messageAssets).where(eq(messageAssets.messageId, messageId));
    expect(attachRows).toHaveLength(1);
    expect(attachRows[0]?.assetId).toBe(asset);
  });

  test("no origin arg (every rpg caller) stamps the DB defaults human/0 — byte-identical", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");

    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    const { messageId } = await postNarratorMessage(chatId, "An rpg recap line.");

    const rows = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(rows[0]?.initiator).toBe("human");
    expect(rows[0]?.automationDepth).toBe(0);
  });

  test("an automation origin stamps initiator=automation + the firing rule's cascade depth on the slot (N1)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");

    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    // The F1 image-post path: the compose op threads the firing rule's origin so a non-opted re-fire is
    // cascade-suppressed (depth ≥ 1). Here depth 1 = a rule fired off a human message (parentDepth 0 + 1).
    const { messageId } = await postNarratorMessage(chatId, "generated art.", [], { initiator: "automation", automationDepth: 1 });

    const rows = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(rows[0]?.initiator).toBe("automation");
    expect(rows[0]?.automationDepth).toBe(1);
  });

  // THE D124 WRITE-BOUNDARY ENFORCER. rpg used to mint a content-less assistant slot here to KEY a
  // hand-written snapshot; that row was durable canon no reader could see, and it leaked into both export
  // formats (`"mes":""` rows named "Group"), the memory digests, plugin reads, automation `messageCommitted`
  // facts, the chat-list counts, every fork and every client cache — seven filters chased it and eight planes
  // never learned. The reshape moved hand state off the message plane entirely; THIS refusal is what makes
  // the row class unrepresentable instead of policed.
  test("REFUSES a blank post — a content-less canon row is not a message, and nothing is written", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");

    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    await expect(postNarratorMessage(chatId, "")).rejects.toThrow(BLANK_POST_RE);
    // Whitespace-only is the same nothing — the old SQL/JS `trim()` divergence has no row class left to split.
    await expect(postNarratorMessage(chatId, "   \n ")).rejects.toThrow(BLANK_POST_RE);
    // NOTHING committed: no slot, no variant, and no `messageCommitted` fact for automation to fire on.
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toEqual([]);
    expect(emitted).toEqual([]);
  });

  test("a MEDIA-ONLY post is legal — the image refs ARE the body", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");
    const assetId = await seedAsset(db, host, "narrator_media");

    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    // The refusal reads the ASSEMBLED body, so an illustration post with no prose still lands (D51 embedded
    // refs). Refusing on the raw `content` argument would have killed this real path.
    const { messageId } = await postNarratorMessage(chatId, "", [assetId]);
    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, messageId));
    expect(variants[0]?.content).toContain(`asset:${assetId}`);
  });

  test("a chat with no host cannot mint the narrator identity", async () => {
    const chatId = await seedChat(db, "a");
    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.reject(new Error("should not mint")) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });
    await expect(postNarratorMessage(chatId, "orphaned")).rejects.toThrow("no host");
  });

  // ── The husk belt (#1463 item 6) ──────────────────────────────────────────────────────────────────────
  // Claiming is the one-way husk→real transition: it publishes the room into every member's library and
  // replays the creation-time economics. A post that CANNOT succeed must not spend that transition — so
  // everything checkable is checked BEFORE the claim, and the claim still precedes the write (the ordering
  // invariant in `verbs/claim-chat.ts`, which a claim-after-write would break by double-counting).
  test("a refused post never claims the husk (validation precedes the claim; the claim still precedes the write)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "husk", { startedAt: null });
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(db, host, "narrator");
    const claims: string[] = [];
    const claimChat = (id: string): Promise<void> => {
      claims.push(id);
      return Promise.resolve();
    };
    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat });

    await expect(postNarratorMessage(chatId, "   \n ")).rejects.toThrow(BLANK_POST_RE);
    expect(claims).toEqual([]);

    // …and the succeeding post DOES claim, before its write.
    await postNarratorMessage(chatId, "The bell tolls.");
    expect(claims).toEqual([chatId]);
  });

  test("a hostless chat is refused before the claim (no husk published for a post that cannot commit)", async () => {
    const chatId = await seedChat(db, "orphan", { startedAt: null });
    const claims: string[] = [];
    const ctx = makeChatContext(db, { mintSyntheticGroupCharacter: () => Promise.reject(new Error("should not mint")) });
    const postNarratorMessage = createPostNarratorMessage(ctx, {
      emit,
      claimChat: (id) => {
        claims.push(id);
        return Promise.resolve();
      },
    });

    await expect(postNarratorMessage(chatId, "orphaned")).rejects.toThrow("no host");
    expect(claims).toEqual([]);
  });

  // ── The seq-allocation race (#1463 item 7) ────────────────────────────────────────────────────────────
  // Real concurrent callers exist (the automation plugin bridge, rpg's checkpoint restore and its turn ops
  // all post narrator rows off their own clocks). Two posts that read the same canon head both mint `seq+1`;
  // the loser trips the `(chat_id, seq)` unique and — without the same retry the image path already carries —
  // takes the whole message with it.
  test("two concurrent narrator posts both commit (the loser re-allocates instead of dying)", async () => {
    const held = await freshHeldDb();
    const host = await seedUser(held.db, castId<Handle>("host"));
    const chatId = await seedChat(held.db, "race");
    await seedParticipant(held.db, { chatId, key: "host", userId: host, role: "host" });
    const groupChar = await seedCharacter(held.db, host, "narrator");
    const ctx = makeChatContext(held.db, { mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: groupChar }) });
    const postNarratorMessage = createPostNarratorMessage(ctx, { emit, claimChat: noClaim });

    // Park BOTH posts at the canon-head read, so each allocates from the SAME max seq.
    const gate = held.hold(/select max\("seq"\)/iu, 2);
    const first = postNarratorMessage(chatId, "first line");
    const second = postNarratorMessage(chatId, "second line");
    await gate.reached;
    gate.release();
    await Promise.all([first, second]);

    const rows = await held.db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows.map((r) => r.seq).toSorted((a, b) => a - b)).toEqual([1, 2]);
  });
});
