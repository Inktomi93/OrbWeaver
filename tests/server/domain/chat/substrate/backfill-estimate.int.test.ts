// substrate/backfill-estimate — the memory backfill confirm's call count, read without the planner: it equals
// the summarize calls the real sweep makes, drops to zero once the chat is built, mints nothing, and honours a chat scope.

import type { Db } from "@orb/db";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, vi } from "vitest";
import type { ResolveBackfillMemoryConfig } from "../../../../../packages/server/src/domain/chat/contract/memory.ts";
import { backfillMemory } from "../../../../../packages/server/src/domain/chat/substrate/backfill.ts";
import { estimateMemoryBackfillCalls } from "../../../../../packages/server/src/domain/chat/substrate/backfill-estimate.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant, seedUser } from "../_support.ts";
import { fakeSummarize, realMemoryWiring, seedTurns } from "../memory/_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("estimateMemoryBackfillCalls — the confirm's count, read without the planner", () => {
  test("the estimate is the summarize calls the sweep makes, and nothing once the chat is built", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const aria = await seedCharacter(db, host, "aria");
    const room = await seedChat(db, "room_estimate");
    await seedParticipant(db, { chatId: room, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: room, key: "c", characterId: aria });
    await seedTurns(db, room, aria, 8);
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    // 8 aged-out turns in blocks of 2 = 4 tier-0 summaries, then 2 tier-1 consolidations of 2 children each.
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 1 });

    const before = await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: null }, cfg);
    await backfillMemory(ctx, { signal: new AbortController().signal, ownerId: host, funderUserId: host, chatIds: null }, cfg);

    expect(before).toBe(summarize.calls.length);
    expect(before).toBe(6);
    expect(await estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: null }, cfg)).toBe(0);
  });

  test("a group room counts its unminted shared bucket as unbuilt, mints nothing, and costs nothing with memory off", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const g1 = await seedCharacter(db, host, "g1");
    const g2 = await seedCharacter(db, host, "g2");
    const group = await seedChat(db, "room_estimate_group");
    await seedParticipant(db, { chatId: group, key: "h", userId: host, role: "host" });
    await seedParticipant(db, { chatId: group, key: "c1", characterId: g1 });
    await seedParticipant(db, { chatId: group, key: "c2", characterId: g2 });
    await seedTurns(db, group, g1, 4);
    const mint = vi.fn(() => Promise.resolve({ characterId: "character_group" as CharacterId }));
    const { ctx } = await realMemoryWiring(db, host, { mintSyntheticGroupCharacter: mint, findSyntheticGroupCharacter: () => Promise.resolve(null) });
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });

    // Three buckets (the shared one + each seated character), two blocks each, no consolidation at fanOut 4.
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: null }, cfg)).resolves.toBe(6);
    expect(mint).not.toHaveBeenCalled();
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: null }, () => Promise.resolve({ mode: "off" }))).resolves.toBe(
      0,
    );
  });

  // An import's "Build memory for imported chats" offer scopes the run to the chats that import wrote: the count
  // and the sweep cover those chats only, and an id outside the host's own rooms is never reached.
  test("a chat-scoped estimate counts only the listed chats, and the scoped sweep builds exactly those", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const aria = await seedCharacter(db, host, "aria");
    const bryn = await seedCharacter(db, stranger, "bryn");
    const imported = await seedChat(db, "room_imported");
    const older = await seedChat(db, "room_older");
    const foreign = await seedChat(db, "room_foreign");
    for (const [room, user, character] of [
      [imported, host, aria],
      [older, host, aria],
      [foreign, stranger, bryn],
    ] as const) {
      await seedParticipant(db, { chatId: room, key: `${room}_h`, userId: user, role: "host" });
      await seedParticipant(db, { chatId: room, key: `${room}_c`, characterId: character });
      await seedTurns(db, room, character, 4);
    }
    const summarize = fakeSummarize();
    const { ctx } = await realMemoryWiring(db, host, { summarize: summarize.op });
    // 4 aged-out turns in blocks of 2 = 2 tier-0 summaries per room, no consolidation at fanOut 4.
    const cfg: ResolveBackfillMemoryConfig = () => Promise.resolve({ blockSize: 2, verbatimWindow: 0, fanOut: 4, maxTier: 1 });
    const scope = { ownerId: host, funderUserId: host, chatIds: [imported, foreign] };

    const scoped = await estimateMemoryBackfillCalls(ctx, scope, cfg);
    await backfillMemory(ctx, { ...scope, signal: new AbortController().signal }, cfg);

    expect(scoped).toBe(2);
    expect(summarize.calls).toHaveLength(scoped);
    // The scoped run built the imported room only: the host's older room is still unbuilt, the imported one is done.
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: [older] }, cfg)).resolves.toBe(2);
    await expect(estimateMemoryBackfillCalls(ctx, { ownerId: host, funderUserId: host, chatIds: [imported] }, cfg)).resolves.toBe(0);
  });
});
