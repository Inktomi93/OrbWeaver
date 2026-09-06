// substrate/host-fenced-write — the resolve-host → bump-stats-canon → batch trio four verbs used to spell
// out (#1767). `.int`: the WHOLE point is the durable outcome, so the real `bumpStatsCanonVersion` and a real
// libSQL batch ride here — a fake bump would pin the call and miss the two facts that matter (the canon row
// actually moves, and it moves ATOMICALLY with the caller's statement).
//
// WHAT THIS EXISTS TO CATCH, stated as the defect rather than the API: a fifth caller spelling the resolve
// and the batch but FORGETTING the bump. That reads as a working write and serves stale stats canon forever,
// which is why the trio got one home at all.

import type { Db } from "@orb/db";
import { chats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { bumpStatsCanonVersion } from "@orb/server/domain/stats";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { commitHostFencedWrite } from "../../../../../packages/server/src/domain/chat/substrate/host-fenced-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedChat, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** The context with the REAL bump wired — the `chat-lifecycle.int` precedent. The shared support default is
 *  a no-op, which would make every assertion below vacuous. */
const ctxWithRealBump = (): ReturnType<typeof makeChatContext> =>
  makeChatContext(db, { bumpStatsCanonVersion: (batch, opDb, ownerId) => bumpStatsCanonVersion(batch as BatchStmt[], opDb, ownerId) });

/** The caller's own statement — a title write, the shape `commitFencedChatWrite` passes. */
const titleWrite = (chatId: Awaited<ReturnType<typeof seedChat>>, title: string): BatchStmt =>
  batchStmt(db.update(chats).set({ title }).where(eq(chats.id, chatId)));

const canonVersion = async (ownerId: UserId): Promise<number | undefined> =>
  (await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, ownerId)))[0]?.version;

describe("commitHostFencedWrite", () => {
  test("the caller's statement commits AND the room host's stats-canon version moves (the step a hand-rolled site forgets)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "fenced");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });

    await commitHostFencedWrite(ctxWithRealBump(), chatId, [titleWrite(chatId, "Renamed")]);

    expect((await db.select().from(chats).where(eq(chats.id, chatId)))[0]?.title).toBe("Renamed");
    // The bump is an UPSERT-increment, so a second write through the same door moves it again — which is what
    // makes it a retry fence rather than a boolean.
    expect(await canonVersion(host)).toBe(1);
    await commitHostFencedWrite(ctxWithRealBump(), chatId, [titleWrite(chatId, "Renamed twice")]);
    expect(await canonVersion(host)).toBe(2);
  });

  test("the bump is CREDITED TO THE ROOM'S HOST, not to whoever else sits in the room", async () => {
    // The door takes a chatId, never a caller — it resolves the host off the participant rows. A member's
    // presence must not move a version, or the stats rebuild fence would be keyed to the wrong owner.
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const chatId = await seedChat(db, "credit");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });

    await commitHostFencedWrite(ctxWithRealBump(), chatId, [titleWrite(chatId, "Renamed")]);

    expect(await canonVersion(host)).toBe(1);
    expect(await canonVersion(member)).toBeUndefined();
  });

  test("ATOMIC: a failing statement rolls the bump back with it — never a version for a write that did not land", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "atomic");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    // A statement that MUST fail at the db: a second `chats` row under an id that already exists (PK).
    const doomed = batchStmt(db.insert(chats).values({ id: chatId }));

    const err = await commitHostFencedWrite(ctxWithRealBump(), chatId, [doomed]).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // The bump rode the SAME batch, so it is gone too. If the two ever split into separate commits, a failed
    // canon write would still advertise a new canon version — the exact lie the one-batch shape prevents.
    expect(await canonVersion(host)).toBeUndefined();
  });

  test("HOSTLESS is a no-op bump, never a refusal — the statements still commit", async () => {
    // An archived orphan or a racing delete answers `null` for the host. The header's ruling: the bump has no
    // owner to credit, and refusing the write would turn a stats-cache concern into a canon-write failure.
    // (This door is NOT an authorization fence — it takes no caller and checks no role. The verbs above it own
    // that, e.g. `chat-lifecycle`'s `requireHost`; a call reaching here has already been authorized.)
    const chatId = await seedChat(db, "hostless");
    const bystander = await seedUser(db, castId<Handle>("bystander"));
    await seedParticipant(db, { chatId, key: "m", userId: bystander, role: "member" });

    await commitHostFencedWrite(ctxWithRealBump(), chatId, [titleWrite(chatId, "Renamed")]);

    expect((await db.select().from(chats).where(eq(chats.id, chatId)))[0]?.title).toBe("Renamed");
    expect(await canonVersion(bystander)).toBeUndefined();
    expect(await db.select().from(statsCanonVersions)).toEqual([]);
  });

  test("the batch RESULTS come back, so a guarded caller can still read its own RETURNING rows", async () => {
    // `set-rpg-pointer` reads `results[0]` to tell "the guarded update matched nothing" from "the chat is
    // gone". Swallowing the results here would have forced it back to a hand-rolled batch.
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "returning");
    await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
    const returning = batchStmt(db.update(chats).set({ title: "Renamed" }).where(eq(chats.id, chatId)).returning({ id: chats.id }));

    const results = await commitHostFencedWrite(ctxWithRealBump(), chatId, [returning]);

    expect(results[0]).toEqual([{ id: chatId }]);
  });
});
